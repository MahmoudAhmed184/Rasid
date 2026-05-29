using Rasid.Server.Contracts;
using Rasid.Server.Models;
using Rasid.Server.Options;
using Rasid.Server.Platforms;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Rasid.Server.Services;

public sealed class ScrapeCycleRunner : IScrapeCycleRunner
{
    private readonly ILogger<ScrapeCycleRunner> _logger;
    private readonly IServiceScopeFactory _serviceScopeFactory;
    private readonly ISeenJobCache _seenJobCache;
    private readonly IJobBroadcaster _jobBroadcaster;
    private readonly JobScraperOptions _options;
    private bool _isPrimed;

    public ScrapeCycleRunner(
        ILogger<ScrapeCycleRunner> logger,
        IServiceScopeFactory serviceScopeFactory,
        ISeenJobCache seenJobCache,
        IJobBroadcaster jobBroadcaster,
        IOptions<JobScraperOptions> options)
    {
        _logger = logger;
        _serviceScopeFactory = serviceScopeFactory;
        _seenJobCache = seenJobCache;
        _jobBroadcaster = jobBroadcaster;
        _options = options.Value;
    }

    public async Task RunOnceAsync(CancellationToken cancellationToken)
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
            string.Join(", ", scrapers.Select(scraper => scraper.Platform.Id)));

        var newJobsAcrossPlatforms = new List<JobListing>();
        var seededBaseline = false;

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

            if (!_isPrimed)
            {
                await _seenJobCache.RememberAsync(listings.Select(job => job.Key).ToArray(), cancellationToken);
                seededBaseline = true;

                _logger.LogInformation(
                    "Primed baseline for {PlatformId} with {JobCount} existing job(s).",
                    scraper.Platform.Id,
                    listings.Count);

                continue;
            }

            var unseenKeys = await _seenJobCache.GetUnseenAsync(
                listings.Select(job => job.Key).ToArray(),
                cancellationToken);

            if (unseenKeys.Count == 0)
            {
                _logger.LogInformation("No new jobs found on {PlatformId}.", scraper.Platform.Id);
                continue;
            }

            var newJobs = listings
                .Where(job => unseenKeys.Contains(job.Key))
                .ToArray();

            await _seenJobCache.RememberAsync(newJobs.Select(job => job.Key).ToArray(), cancellationToken);

            _logger.LogInformation(
                "Found {JobCount} new job(s) on {PlatformId}.",
                newJobs.Length,
                scraper.Platform.Id);

            var enrichedJobs = await EnrichAsync(scraper, newJobs, cancellationToken);
            newJobsAcrossPlatforms.AddRange(enrichedJobs);
        }

        if (!_isPrimed && seededBaseline)
        {
            _isPrimed = true;
            _logger.LogInformation("Initial scrape baseline created. Existing jobs were not broadcast.");
            return;
        }

        if (newJobsAcrossPlatforms.Count == 0)
        {
            _logger.LogInformation("No new jobs found in this cycle.");
            return;
        }

        await _jobBroadcaster.BroadcastNewJobsAsync(
            new NewJobsDetectedMessage(DateTimeOffset.UtcNow, newJobsAcrossPlatforms),
            cancellationToken);
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

    private async Task<IReadOnlyList<JobListing>> EnrichAsync(
        IJobPlatformScraper scraper,
        IReadOnlyList<JobListing> jobs,
        CancellationToken cancellationToken)
    {
        var maxConcurrency = Math.Max(1, _options.MaxConcurrentEnrichmentsPerPlatform);
        using var throttler = new SemaphoreSlim(maxConcurrency, maxConcurrency);

        var tasks = jobs
            .Select((job, index) => EnrichOneAsync(scraper, job, index, throttler, cancellationToken))
            .ToArray();

        var enriched = await Task.WhenAll(tasks);

        return enriched
            .OrderBy(result => result.Index)
            .Select(result => result.Job)
            .ToArray();
    }

    private async Task<(int Index, JobListing Job)> EnrichOneAsync(
        IJobPlatformScraper scraper,
        JobListing job,
        int index,
        SemaphoreSlim throttler,
        CancellationToken cancellationToken)
    {
        await throttler.WaitAsync(cancellationToken);

        try
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
                return (index, job);
            }

            if (detailsResult.IsSuccess && detailsResult.Value is not null)
            {
                return (index, job.Apply(detailsResult.Value));
            }

            LogDetailsResult(scraper.Platform, job.Id, detailsResult);
            return (index, job);
        }
        finally
        {
            throttler.Release();
        }
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
