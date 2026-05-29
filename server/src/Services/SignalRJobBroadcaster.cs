using Rasid.Server.Contracts;
using Rasid.Server.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Rasid.Server.Services;

public sealed class SignalRJobBroadcaster : IJobBroadcaster
{
    private readonly IHubContext<JobNotificationHub> _hubContext;
    private readonly ILogger<SignalRJobBroadcaster> _logger;

    public SignalRJobBroadcaster(
        IHubContext<JobNotificationHub> hubContext,
        ILogger<SignalRJobBroadcaster> logger)
    {
        _hubContext = hubContext;
        _logger = logger;
    }

    public async Task BroadcastNewJobsAsync(
        NewJobsDetectedMessage message,
        CancellationToken cancellationToken)
    {
        await _hubContext.Clients.All.SendAsync(
            "NewJobsDetected",
            new
            {
                timestamp = message.Timestamp.UtcDateTime,
                count = message.Count,
                platforms = message.Platforms,
                jobs = message.Jobs.Select(job => new
                {
                    id = job.Id,
                    platformId = job.PlatformId,
                    title = job.Title,
                    budget = job.Budget,
                    time = job.Time,
                    url = job.Url,
                    poster = job.Poster,
                    postedAt = job.PostedAt,
                    lastInteractionAt = job.LastInteractionAt,
                    bidsText = job.BidsText,
                    description = job.Description,
                    hiringRate = job.HiringRate,
                    status = job.Status,
                    communications = job.Communications,
                    duration = job.Duration,
                    registrationDate = job.RegistrationDate,
                    clientName = job.ClientName,
                    clientType = job.ClientType,
                    tags = job.Tags
                })
            },
            cancellationToken);

        _logger.LogInformation("Broadcast {JobCount} new job(s) to connected clients.", message.Count);
    }
}
