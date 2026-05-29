using Rasid.Server.Options;
using Microsoft.Extensions.Options;

namespace Rasid.Server.Services;

public sealed class JobPollingWorker : BackgroundService
{
    private readonly IScrapeCycleRunner _cycleRunner;
    private readonly JobScraperOptions _options;
    private readonly ILogger<JobPollingWorker> _logger;

    public JobPollingWorker(
        IScrapeCycleRunner cycleRunner,
        IOptions<JobScraperOptions> options,
        ILogger<JobPollingWorker> logger)
    {
        _cycleRunner = cycleRunner;
        _options = options.Value;
        _logger = logger;
    }

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
                stoppingToken);
        }

        using var timer = new PeriodicTimer(
            TimeSpan.FromSeconds(Math.Max(1, _options.CheckIntervalSeconds)));

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
