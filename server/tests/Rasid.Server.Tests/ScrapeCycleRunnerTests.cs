using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Rasid.Server.Contracts;
using Rasid.Server.Models;
using Rasid.Server.Options;
using Rasid.Server.Platforms;
using Rasid.Server.Storage;
using Rasid.Server.Workers;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class ScrapeCycleRunnerTests
{
    [Fact]
    public async Task RunOnceAsync_PrimesEachPlatformIndependently_WhenOneFailsInitially()
    {
        var timeProvider = TimeProvider.System;
        var cache = new InMemoryTestCache();
        var channel = new JobChannel(100);
        var options = Microsoft.Extensions.Options.Options.Create(new JobScraperOptions());

        var scraperA = new TestPlatformScraper("platform-a");
        var scraperB = new TestPlatformScraper("platform-b");

        var services = new ServiceCollection();
        services.AddSingleton<IJobPlatformScraper>(scraperA);
        services.AddSingleton<IJobPlatformScraper>(scraperB);
        var serviceProvider = services.BuildServiceProvider();

        var runner = new ScrapeCycleRunner(
            NullLogger<ScrapeCycleRunner>.Instance,
            serviceProvider.GetRequiredService<IServiceScopeFactory>(),
            cache,
            channel,
            options,
            timeProvider);

        // Cycle 1: platform-a has 2 listings and succeeds. platform-b fails.
        var jobA1 = new JobListing("a1", "platform-a", "Job A1", "$10", "now", "https://example.com/a1");
        var jobA2 = new JobListing("a2", "platform-a", "Job A2", "$20", "now", "https://example.com/a2");
        scraperA.ListingsToReturn = [jobA1, jobA2];
        scraperB.ShouldFailListings = true;

        await runner.RunOnceAsync(CancellationToken.None);

        // Platform A must be primed, so no jobs in channel
        Assert.False(channel.Reader.TryRead(out _));
        Assert.Equal(2, cache.RememberedKeys.Count);
        Assert.Contains(jobA1.Key, cache.RememberedKeys);
        Assert.Contains(jobA2.Key, cache.RememberedKeys);

        // Cycle 2: platform-a has same jobs. platform-b now succeeds with 2 listings.
        scraperB.ShouldFailListings = false;
        var jobB1 = new JobListing("b1", "platform-b", "Job B1", "$30", "now", "https://example.com/b1");
        var jobB2 = new JobListing("b2", "platform-b", "Job B2", "$40", "now", "https://example.com/b2");
        scraperB.ListingsToReturn = [jobB1, jobB2];

        await runner.RunOnceAsync(CancellationToken.None);

        // Platform B must have been primed on its first successful cycle (NOT broadcast!)
        Assert.False(channel.Reader.TryRead(out _));
        Assert.Contains(jobB1.Key, cache.RememberedKeys);
        Assert.Contains(jobB2.Key, cache.RememberedKeys);

        // Cycle 3: platform-a now returns a NEW job. It should be broadcast to the channel!
        var jobA3 = new JobListing("a3", "platform-a", "Job A3", "$50", "now", "https://example.com/a3");
        scraperA.ListingsToReturn = [jobA1, jobA2, jobA3];

        await runner.RunOnceAsync(CancellationToken.None);

        Assert.True(channel.Reader.TryRead(out var readJob));
        Assert.NotNull(readJob);
        Assert.Equal("a3", readJob.Id);
        Assert.Equal("platform-a", readJob.PlatformId);
        Assert.False(channel.Reader.TryRead(out _)); // Only 1 new job
    }

    [Fact]
    public async Task RunOnceAsync_AppliesKhamsatFreshnessPolicy_FilteringStaleAndRetryable()
    {
        var testTime = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new TestTimeProvider(testTime);
        var cache = new InMemoryTestCache();
        var channel = new JobChannel(100);
        var options = Microsoft.Extensions.Options.Options.Create(new JobScraperOptions
        {
            KhamsatPublishFreshnessHours = 24
        });

        var khamsatScraper = new TestPlatformScraper("khamsat");
        var services = new ServiceCollection();
        services.AddSingleton<IJobPlatformScraper>(khamsatScraper);
        var serviceProvider = services.BuildServiceProvider();

        var runner = new ScrapeCycleRunner(
            NullLogger<ScrapeCycleRunner>.Instance,
            serviceProvider.GetRequiredService<IServiceScopeFactory>(),
            cache,
            channel,
            options,
            timeProvider);

        // Cycle 1: prime baseline with k0
        var jobK0 = new JobListing("k0", "khamsat", "Baseline Job", "$5", "now", "https://khamsat.com/community/requests/k0");
        khamsatScraper.ListingsToReturn = [jobK0];
        await runner.RunOnceAsync(CancellationToken.None);
        Assert.False(channel.Reader.TryRead(out _));

        // Cycle 2: return fresh, stale, and retry jobs
        var jobFresh = new JobListing("k-fresh", "khamsat", "Fresh Job", "$5", "now", "https://khamsat.com/community/requests/fresh");
        var jobStale = new JobListing("k-stale", "khamsat", "Stale Job", "$5", "now", "https://khamsat.com/community/requests/stale");
        var jobRetry = new JobListing("k-retry", "khamsat", "Retry Job", "$5", "now", "https://khamsat.com/community/requests/retry");

        khamsatScraper.ListingsToReturn = [jobK0, jobFresh, jobStale, jobRetry];
        khamsatScraper.DetailsFactory = job => job.Id switch
        {
            "k-fresh" => new JobDetails(PostedAt: testTime.AddHours(-2).UtcDateTime.ToString("dd/MM/yyyy HH:mm:ss 'GMT'")),
            "k-stale" => new JobDetails(PostedAt: testTime.AddHours(-48).UtcDateTime.ToString("dd/MM/yyyy HH:mm:ss 'GMT'")),
            "k-retry" => new JobDetails(PostedAt: null), // enrichment failed to find timestamp
            _ => new JobDetails()
        };

        await runner.RunOnceAsync(CancellationToken.None);

        // Only k-fresh should be sent to the channel
        Assert.True(channel.Reader.TryRead(out var readJob));
        Assert.NotNull(readJob);
        Assert.Equal("k-fresh", readJob.Id);
        Assert.False(channel.Reader.TryRead(out _));

        // k-fresh and k-stale must be remembered; k-retry must NOT be remembered
        Assert.Contains(jobFresh.Key, cache.RememberedKeys);
        Assert.Contains(jobStale.Key, cache.RememberedKeys);
        Assert.DoesNotContain(jobRetry.Key, cache.RememberedKeys);
    }

    private sealed class InMemoryTestCache : ISeenJobCache
    {
        public HashSet<JobKey> RememberedKeys { get; } = [];

        public Task<IReadOnlySet<JobKey>> GetUnseenAsync(IReadOnlyCollection<JobKey> candidates, CancellationToken cancellationToken)
        {
            var unseen = candidates.Where(c => !RememberedKeys.Contains(c)).ToHashSet();
            return Task.FromResult<IReadOnlySet<JobKey>>(unseen);
        }

        public Task RememberAsync(IReadOnlyCollection<JobKey> keys, CancellationToken cancellationToken)
        {
            foreach (var key in keys)
            {
                RememberedKeys.Add(key);
            }
            return Task.CompletedTask;
        }
    }

    private sealed class TestPlatformScraper(string id) : IJobPlatformScraper
    {
        public JobPlatformDescriptor Platform { get; } = new(id, id, $"https://example.com/{id}");
        public IReadOnlyList<JobListing> ListingsToReturn { get; set; } = [];
        public bool ShouldFailListings { get; set; }
        public Func<JobListing, JobDetails>? DetailsFactory { get; set; }

        public Task<ScrapeResult<IReadOnlyList<JobListing>>> FetchListingsAsync(CancellationToken cancellationToken)
        {
            if (ShouldFailListings)
            {
                return Task.FromResult(ScrapeResult<IReadOnlyList<JobListing>>.Failed("Simulated scrape failure", Platform.ListingUrl));
            }

            return Task.FromResult(ScrapeResult<IReadOnlyList<JobListing>>.Success(ListingsToReturn));
        }

        public Task<ScrapeResult<JobDetails>> FetchDetailsAsync(JobListing listing, CancellationToken cancellationToken)
        {
            var details = DetailsFactory?.Invoke(listing) ?? new JobDetails();
            return Task.FromResult(ScrapeResult<JobDetails>.Success(details));
        }
    }
}
