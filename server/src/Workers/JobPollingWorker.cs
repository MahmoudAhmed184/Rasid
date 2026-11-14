using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Rasid.Server.Options;

namespace Rasid.Server.Workers;

public sealed class JobPollingWorker(
    IScrapeCycleRunner cycleRunner,
    IOptions<JobScraperOptions> options,
    TimeProvider timeProvider,
    ILogger<JobPollingWorker> logger) : BackgroundService
{
    private readonly IScrapeCycleRunner _cycleRunner = cycleRunner;
    private readonly JobScraperOptions _options = options.Value;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<JobPollingWorker> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Job polling worker started. InitialDelaySeconds={InitialDelaySeconds}, CheckIntervalSeconds={CheckIntervalSeconds}.",
            _options.InitialDelaySeconds,
            _options.CheckIntervalSeconds);

        if (_options.InitialDelaySeconds > 0)
        {
            await Task.Delay(
                TimeSpan.FromSeconds(Math.Max(0, _options.InitialDelaySeconds)),
                _timeProvider,
                stoppingToken);
        }

        using var timer = new PeriodicTimer(
            TimeSpan.FromSeconds(Math.Max(1, _options.CheckIntervalSeconds)),
            _timeProvider);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _cycleRunner.RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled error while running scrape cycle.");
            }

            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken))
                {
                    break;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }

        _logger.LogInformation("Job polling worker stopped.");
    }
}
