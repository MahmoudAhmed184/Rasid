using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Rasid.Server.Contracts;
using Rasid.Server.Models;

namespace Rasid.Server.Hubs;

public sealed class SignalRJobBroadcaster(
    IHubContext<JobNotificationHub, IJobNotificationClient> hubContext,
    ILogger<SignalRJobBroadcaster> logger) : IJobBroadcaster
{
    private readonly IHubContext<JobNotificationHub, IJobNotificationClient> _hubContext = hubContext;
    private readonly ILogger<SignalRJobBroadcaster> _logger = logger;

    public async Task BroadcastNewJobsAsync(
        NewJobsDetectedMessage message,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var jobPayloads = new JobListingPayload[message.Jobs.Count];
        for (var i = 0; i < message.Jobs.Count; i++)
        {
            jobPayloads[i] = JobListingPayload.From(message.Jobs[i]);
        }

        var payload = new NewJobsDetectedPayload(
            Timestamp: message.Timestamp.UtcDateTime,
            Count: message.Count,
            Platforms: message.Platforms,
            Jobs: jobPayloads);

        try
        {
            await _hubContext.Clients.All.NewJobsDetected(payload).WaitAsync(cancellationToken);
            _logger.LogInformation("Broadcast {JobCount} new job(s) across platform(s) {Platforms} to connected SignalR clients.",
                message.Count, string.Join(", ", message.Platforms));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to broadcast {JobCount} jobs via SignalR hub.", message.Count);
        }
    }
}
