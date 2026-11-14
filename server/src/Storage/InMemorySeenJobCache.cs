using Microsoft.Extensions.Options;
using Rasid.Server.Contracts;
using Rasid.Server.Options;

namespace Rasid.Server.Storage;

public sealed class InMemorySeenJobCache : ISeenJobCache
{
    private readonly object _gate = new();
    private readonly int _maxEntries;
    private readonly HashSet<JobKey> _keys = [];
    private readonly Queue<JobKey> _order = [];

    public InMemorySeenJobCache(IOptions<JobScraperOptions> options)
        : this(options.Value.MaxSeenJobs)
    {
    }

    public InMemorySeenJobCache(int maxEntries = 5000)
    {
        _maxEntries = Math.Max(1, maxEntries);
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
