using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Rasid.Server.Contracts;
using Rasid.Server.Models;

namespace Rasid.Server.Hubs;

public class JobNotificationHub(ILogger<JobNotificationHub> logger, TimeProvider timeProvider) : Hub<IJobNotificationClient>
{
    private readonly ILogger<JobNotificationHub> _logger = logger;
    private readonly TimeProvider _timeProvider = timeProvider;

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("SignalR client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();

        try
        {
            await Clients.Caller.Connected(new ConnectedPayload(
                Context.ConnectionId,
                _timeProvider.GetUtcNow().UtcDateTime,
                "Successfully connected to Job Notification Hub"));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send Connected acknowledgement to client: {ConnectionId}", Context.ConnectionId);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception is not null)
        {
            _logger.LogWarning(exception, "SignalR client {ConnectionId} disconnected with error.", Context.ConnectionId);
        }
        else
        {
            _logger.LogInformation("SignalR client disconnected cleanly: {ConnectionId}", Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task Ping()
    {
        try
        {
            await Clients.Caller.Pong(_timeProvider.GetUtcNow().UtcDateTime);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send Pong to client: {ConnectionId}", Context.ConnectionId);
        }
    }
}
