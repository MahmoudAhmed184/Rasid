using Rasid.Server.Contracts;

namespace Rasid.Server.Hubs;

public interface IJobBroadcaster
{
    Task BroadcastNewJobsAsync(
        NewJobsDetectedMessage message,
        CancellationToken cancellationToken);
}
