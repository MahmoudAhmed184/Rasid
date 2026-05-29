using Rasid.Server.Contracts;

namespace Rasid.Server.Services;

public interface IJobBroadcaster
{
    Task BroadcastNewJobsAsync(
        NewJobsDetectedMessage message,
        CancellationToken cancellationToken);
}
