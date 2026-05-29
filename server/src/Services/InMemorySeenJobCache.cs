using Rasid.Server.Contracts;
using Rasid.Server.Options;
using Microsoft.Extensions.Options;

namespace Rasid.Server.Services;

public sealed class InMemorySeenJobCache : ISeenJobCache
{
    private readonly object _gate = new();
    private readonly int _maxEntries;
    private readonly HashSet<JobKey> _keys = [];
    private readonly Queue<JobKey> _order = [];

    public InMemorySeenJobCache(IOptions<JobScraperOptions> options)
    {
        _maxEntries = Math.Max(1, options.Value.MaxSeenJobs);
    }

    public Task<IReadOnlySet<JobKey>> GetUnseenAsync(
        IReadOnlyCollection<JobKey> candidates,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            IReadOnlySet<JobKey> unseen = candidates
                .Where(candidate => !_keys.Contains(candidate))
                .ToHashSet();

            return Task.FromResult(unseen);
        }
    }

    public Task RememberAsync(
        IReadOnlyCollection<JobKey> keys,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_gate)
        {
            foreach (var key in keys)
            {
                if (_keys.Add(key))
                {
                    _order.Enqueue(key);
                }
            }

            while (_order.Count > _maxEntries)
            {
                _keys.Remove(_order.Dequeue());
            }
        }

        return Task.CompletedTask;
    }
}
