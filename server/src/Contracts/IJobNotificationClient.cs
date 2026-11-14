using Rasid.Server.Models;

namespace Rasid.Server.Contracts;

public interface IJobNotificationClient
{
    Task Connected(ConnectedPayload message);
    Task NewJobsDetected(NewJobsDetectedPayload message);
    Task AdminMessageReceived(AdminMessagePayload message);
    Task Pong(DateTime timestamp);
}
