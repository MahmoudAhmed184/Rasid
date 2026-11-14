using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Rasid.Server.Contracts;
using Rasid.Server.Models;
using Rasid.Server.Options;
using Rasid.Server.Platforms;
using Rasid.Server.Storage;

namespace Rasid.Server.Workers;

public sealed class ScrapeCycleRunner(
    ILogger<ScrapeCycleRunner> logger,
    IServiceScopeFactory serviceScopeFactory,
    ISeenJobCache seenJobCache,
    JobChannel jobChannel,
    IOptions<JobScraperOptions> options,
    TimeProvider timeProvider) : IScrapeCycleRunner
{
    private readonly ILogger<ScrapeCycleRunner> _logger = logger;
    private readonly IServiceScopeFactory _serviceScopeFactory = serviceScopeFactory;
    private readonly ISeenJobCache _seenJobCache = seenJobCache;
    private readonly JobChannel _jobChannel = jobChannel;
    private readonly JobScraperOptions _options = options.Value;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly SemaphoreSlim _cycleGate = new(1, 1);
    private readonly HashSet<string> _primedPlatforms = new(StringComparer.OrdinalIgnoreCase);

    public async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        // Prevent concurrent overlapping cycles
        if (!await _cycleGate.WaitAsync(0, cancellationToken))
        {
            _logger.LogWarning("A scrape cycle is already in progress. Skipping overlapping run.");
            return;
        }

        try
        {
            await using var scope = _serviceScopeFactory.CreateAsyncScope();
            var scrapers = scope.ServiceProvider.GetServices<IJobPlatformScraper>().ToList();

            if (scrapers.Count == 0)
            {
                _logger.LogWarning("No platform scrapers were registered. The worker will stay idle.");
                return;
            }

            var cycleId = Guid.NewGuid().ToString("N");
            using var cycleScope = _logger.BeginScope(new Dictionary<string, object?>
            {
                ["CycleId"] = cycleId,
                ["PlatformCount"] = scrapers.Count
            });

            _logger.LogInformation(
                "Starting scrape cycle across {PlatformCount} platform(s): {Platforms}",
                scrapers.Count,
                string.Join(", ", scrapers.Select(static scraper => scraper.Platform.Id)));

            foreach (var scraper in scrapers)
            {
                using var platformScope = _logger.BeginScope(new Dictionary<string, object?>
                {
                    ["PlatformId"] = scraper.Platform.Id
                });

                var listingsResult = await FetchListingsSafelyAsync(scraper, cancellationToken);
                if (!listingsResult.IsSuccess || listingsResult.Value is null)
                {
                    LogListingResult(scraper.Platform, listingsResult);
                    continue;
                }

                var listings = listingsResult.Value;
                if (listings.Count == 0)
                {
                    _logger.LogInformation("No jobs were returned from {PlatformId}.", scraper.Platform.Id);
                    continue;
                }

                if (!_primedPlatforms.Contains(scraper.Platform.Id))
                {
                    await _seenJobCache.RememberAsync(listings.Select(static job => job.Key).ToArray(), cancellationToken);
                    _primedPlatforms.Add(scraper.Platform.Id);

                    _logger.LogInformation(
                        "Primed baseline for {PlatformId} with {JobCount} existing job(s). Existing jobs were not broadcast.",
                        scraper.Platform.Id,
                        listings.Count);

                    continue;
                }

                var unseenKeys = await _seenJobCache.GetUnseenAsync(
                    listings.Select(static job => job.Key).ToArray(),
                    cancellationToken);

                if (unseenKeys.Count == 0)
                {
                    _logger.LogInformation("No new jobs found on {PlatformId}.", scraper.Platform.Id);
                    continue;
                }

                var newJobs = listings
                    .Where(job => unseenKeys.Contains(job.Key))
                    .ToArray();

                _logger.LogInformation(
                    "Found {JobCount} new job(s) on {PlatformId}.",
                    newJobs.Length,
                    scraper.Platform.Id);

                var enrichedJobs = await EnrichAsync(scraper, newJobs, cancellationToken);
                var jobsToBroadcast = new List<JobListing>();
                var jobsToRememberOnly = new List<JobListing>();

                foreach (var job in enrichedJobs)
                {
                    if (!IsKhamsat(job))
                    {
                        jobsToBroadcast.Add(job);
                        continue;
                    }

                    switch (KhamsatFreshnessPolicy.Classify(job, _timeProvider.GetUtcNow(), _options))
                    {
                        case KhamsatFreshness.Fresh:
                            jobsToBroadcast.Add(job);
                            break;
                        case KhamsatFreshness.Stale:
                            jobsToRememberOnly.Add(job);
                            break;
                        case KhamsatFreshness.Retry:
                            _logger.LogWarning(
                                "Khamsat job {JobId} is missing PostedAt after enrichment; it will remain retryable.",
                                job.Id);
                            break;
                    }
                }

                var rememberedKeys = jobsToBroadcast
                    .Concat(jobsToRememberOnly)
                    .Select(static job => job.Key)
                    .ToArray();

                if (rememberedKeys.Length > 0)
                {
                    await _seenJobCache.RememberAsync(rememberedKeys, cancellationToken);
                }

                if (jobsToRememberOnly.Count > 0)
                {
                    _logger.LogInformation(
                        "Suppressed {JobCount} stale Khamsat job(s) after enrichment.",
                        jobsToRememberOnly.Count);
                }

                // Transfer scraped items to decoupled channel writer
                foreach (var job in jobsToBroadcast)
                {
                    await _jobChannel.Writer.WriteAsync(job, cancellationToken);
                }
            }
        }
        finally
        {
            _cycleGate.Release();
        }
    }

    private async Task<ScrapeResult<IReadOnlyList<JobListing>>> FetchListingsSafelyAsync(
        IJobPlatformScraper scraper,
        CancellationToken cancellationToken)
    {
        try
        {
            return await scraper.FetchListingsAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled listing scrape exception for {PlatformId}.", scraper.Platform.Id);
            return ScrapeResult<IReadOnlyList<JobListing>>.Failed(
                ex.Message,
                scraper.Platform.ListingUrl,
                null,
                ScrapeErrorKind.Unknown);
        }
    }

    private static bool IsKhamsat(JobListing job) =>
        string.Equals(job.PlatformId, "khamsat", StringComparison.Ordinal);

    private async Task<IReadOnlyList<JobListing>> EnrichAsync(
        IJobPlatformScraper scraper,
        IReadOnlyList<JobListing> jobs,
        CancellationToken cancellationToken)
    {
        if (jobs.Count == 0)
        {
            return [];
        }

        var enriched = new JobListing[jobs.Count];
        var parallelOptions = new ParallelOptions
        {
            MaxDegreeOfParallelism = Math.Max(1, _options.MaxConcurrentEnrichmentsPerPlatform),
            CancellationToken = cancellationToken
        };

        await Parallel.ForEachAsync(
            Enumerable.Range(0, jobs.Count),
            parallelOptions,
            async (index, ct) =>
            {
                enriched[index] = await EnrichOneAsync(scraper, jobs[index], ct);
            });

        return enriched;
    }

    private async Task<JobListing> EnrichOneAsync(
        IJobPlatformScraper scraper,
        JobListing job,
        CancellationToken cancellationToken)
    {
        using var jobScope = _logger.BeginScope(new Dictionary<string, object?>
        {
            ["PlatformId"] = scraper.Platform.Id,
            ["JobId"] = job.Id
        });

        ScrapeResult<JobDetails> detailsResult;
        try
        {
            detailsResult = await scraper.FetchDetailsAsync(job, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled enrichment exception for {PlatformId} job {JobId}.", scraper.Platform.Id, job.Id);
            return job;
        }

        if (detailsResult.IsSuccess && detailsResult.Value is not null)
        {
            return job.Apply(detailsResult.Value);
        }

        LogDetailsResult(scraper.Platform, job.Id, detailsResult);
        return job;
    }

    private void LogListingResult(
        JobPlatformDescriptor platform,
        ScrapeResult<IReadOnlyList<JobListing>> result)
    {
        switch (result.Outcome)
        {
            case ScrapeOutcomeKind.ChallengeBlocked:
                _logger.LogWarning(
                    "Listing scrape for {PlatformId} was blocked by an upstream challenge: {Message}",
                    platform.Id,
                    result.Error?.Message);
                break;
            case ScrapeOutcomeKind.NotFound:
                _logger.LogWarning(
                    "Listing page for {PlatformId} was not found: {Url}",
                    platform.Id,
                    result.Error?.Url);
                break;
            case ScrapeOutcomeKind.Skipped:
                _logger.LogInformation(
                    "Listing scrape for {PlatformId} was skipped: {Message}",
                    platform.Id,
                    result.Error?.Message);
                break;
            default:
                _logger.LogWarning(
                    "Listing scrape failed for {PlatformId}: {Message}",
                    platform.Id,
                    result.Error?.Message);
                break;
        }
    }

    private void LogDetailsResult(
        JobPlatformDescriptor platform,
        string jobId,
        ScrapeResult<JobDetails> result)
    {
        switch (result.Outcome)
        {
            case ScrapeOutcomeKind.ChallengeBlocked:
                _logger.LogWarning(
                    "Detail scrape for {PlatformId} job {JobId} was blocked by an upstream challenge: {Message}",
                    platform.Id,
                    jobId,
                    result.Error?.Message);
                break;
            case ScrapeOutcomeKind.NotFound:
                _logger.LogInformation(
                    "Detail page for {PlatformId} job {JobId} was not found.",
                    platform.Id,
                    jobId);
                break;
            case ScrapeOutcomeKind.Skipped:
                _logger.LogDebug(
                    "Detail scrape for {PlatformId} job {JobId} was skipped: {Message}",
                    platform.Id,
                    jobId,
                    result.Error?.Message);
                break;
            default:
                _logger.LogWarning(
                    "Detail scrape failed for {PlatformId} job {JobId}: {Message}",
                    platform.Id,
                    jobId,
                    result.Error?.Message);
                break;
        }
    }
}
