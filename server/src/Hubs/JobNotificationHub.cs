using Microsoft.AspNetCore.SignalR;

namespace Rasid.Server.Hubs;

public class JobNotificationHub : Hub
{
    private readonly ILogger<JobNotificationHub> _logger;

    public JobNotificationHub(ILogger<JobNotificationHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();

        await Clients.Caller.SendAsync("Connected", new
        {
            connectionId = Context.ConnectionId,
            timestamp = DateTime.UtcNow,
            message = "Successfully connected to Job Notification Hub"
        });
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);

        if (exception is not null)
        {
            _logger.LogError(exception, "Client {ConnectionId} disconnected with error.", Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public Task Ping() =>
        Clients.Caller.SendAsync("Pong", DateTime.UtcNow);
}
