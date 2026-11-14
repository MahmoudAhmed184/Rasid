using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Rasid.Server.Contracts;
using Rasid.Server.Hubs;
using Rasid.Server.Models;

namespace Rasid.Server.Workers;

public sealed class JobBroadcastingWorker(
    JobChannel jobChannel,
    IJobBroadcaster broadcaster,
    TimeProvider timeProvider,
    ILogger<JobBroadcastingWorker> logger) : BackgroundService
{
    private readonly JobChannel _jobChannel = jobChannel;
    private readonly IJobBroadcaster _broadcaster = broadcaster;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<JobBroadcastingWorker> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Job broadcasting worker started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await _jobChannel.Reader.WaitToReadAsync(stoppingToken))
                {
                    break;
                }

                var batch = new List<JobListing>(50);
                while (batch.Count < 50 && _jobChannel.Reader.TryRead(out var job))
                {
                    batch.Add(job);
                }

                if (batch.Count > 0)
                {
                    var message = new NewJobsDetectedMessage(_timeProvider.GetUtcNow(), batch);
                    await _broadcaster.BroadcastNewJobsAsync(message, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in job broadcasting worker.");
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), _timeProvider, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        _logger.LogInformation("Job broadcasting worker stopped.");
    }
}
