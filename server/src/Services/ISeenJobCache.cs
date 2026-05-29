using Rasid.Server.Contracts;

namespace Rasid.Server.Services;

public interface ISeenJobCache
{
    Task<IReadOnlySet<JobKey>> GetUnseenAsync(
        IReadOnlyCollection<JobKey> candidates,
        CancellationToken cancellationToken);

    Task RememberAsync(
        IReadOnlyCollection<JobKey> keys,
        CancellationToken cancellationToken);
}
