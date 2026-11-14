using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Rasid.Server.Options;

namespace Rasid.Server.Crawler;

public sealed class PerDomainRateLimiter(
    TimeProvider timeProvider,
    IOptions<CrawlerOptions> options,
    ILogger<PerDomainRateLimiter> logger)
{
    private readonly ConcurrentDictionary<string, DomainGate> _gates = new(StringComparer.OrdinalIgnoreCase);
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly IOptions<CrawlerOptions> _options = options;
    private readonly ILogger<PerDomainRateLimiter> _logger = logger;

    public async Task DelayIfNeededAsync(Uri uri, CancellationToken cancellationToken)
    {
        var domain = uri.Host;
        var gate = _gates.GetOrAdd(domain, static _ => new DomainGate());

        await gate.Semaphore.WaitAsync(cancellationToken);
        try
        {
            var now = _timeProvider.GetUtcNow();
            var baseDelay = _options.Value.PerDomainDelayMilliseconds;
            var jitterMax = _options.Value.JitterMaxMilliseconds;

            var jitter = jitterMax > 0 ? Random.Shared.Next(0, jitterMax) : 0;
            var minInterval = TimeSpan.FromMilliseconds(baseDelay + jitter);

            var elapsed = now - gate.LastRequestTime;
            if (elapsed < minInterval && gate.LastRequestTime != DateTimeOffset.MinValue)
            {
                var delay = minInterval - elapsed;
                _logger.LogDebug("Rate limiting {Domain}: waiting {DelayMs}ms.", domain, delay.TotalMilliseconds);
                await Task.Delay(delay, _timeProvider, cancellationToken);
            }

            gate.LastRequestTime = _timeProvider.GetUtcNow();
        }
        finally
        {
            gate.Semaphore.Release();
        }
    }

    private sealed class DomainGate
    {
        public SemaphoreSlim Semaphore { get; } = new(1, 1);
        public DateTimeOffset LastRequestTime { get; set; } = DateTimeOffset.MinValue;
    }
}
