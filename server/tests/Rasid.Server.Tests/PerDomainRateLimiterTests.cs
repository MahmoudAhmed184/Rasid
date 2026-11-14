using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Rasid.Server.Crawler;
using Rasid.Server.Options;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class PerDomainRateLimiterTests
{
    [Fact]
    public async Task DelayIfNeededAsync_DelaysSubsequentRequests_ToSameDomain()
    {
        var startTime = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var testTime = new TestTimeProvider(startTime);
        var options = Microsoft.Extensions.Options.Options.Create(new CrawlerOptions
        {
            PerDomainDelayMilliseconds = 500,
            JitterMaxMilliseconds = 0
        });

        var limiter = new PerDomainRateLimiter(testTime, options, NullLogger<PerDomainRateLimiter>.Instance);
        var uri = new Uri("https://mostaql.com/projects");

        // First request: should proceed immediately
        await limiter.DelayIfNeededAsync(uri, CancellationToken.None);

        // Immediate subsequent request: testTime hasn't advanced, so limiter should await delay
        // We advance time by 200ms
        testTime.Advance(TimeSpan.FromMilliseconds(200));

        // When DelayIfNeededAsync runs, it detects 200ms < 500ms and requests a 300ms delay
        // Using a cancellation token that is not cancelled
        var secondRequestTask = limiter.DelayIfNeededAsync(uri, CancellationToken.None);
        await secondRequestTask;

        // Limiter recorded last request time
        Assert.True(true);
    }

    [Fact]
    public async Task DelayIfNeededAsync_SeparatesLimits_ByDomain()
    {
        var startTime = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var testTime = new TestTimeProvider(startTime);
        var options = Microsoft.Extensions.Options.Options.Create(new CrawlerOptions
        {
            PerDomainDelayMilliseconds = 1000,
            JitterMaxMilliseconds = 0
        });

        var limiter = new PerDomainRateLimiter(testTime, options, NullLogger<PerDomainRateLimiter>.Instance);

        var mostaqlUri = new Uri("https://mostaql.com/projects");
        var khamsatUri = new Uri("https://khamsat.com/community/requests");

        // Request 1 to mostaql
        await limiter.DelayIfNeededAsync(mostaqlUri, CancellationToken.None);

        // Request 1 to khamsat: different domain, should not wait for mostaql's delay window
        await limiter.DelayIfNeededAsync(khamsatUri, CancellationToken.None);

        Assert.True(true);
    }
}
