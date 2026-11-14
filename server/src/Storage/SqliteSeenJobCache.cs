using System.Collections.Frozen;
using System.Text;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Rasid.Server.Contracts;
using Rasid.Server.Options;

namespace Rasid.Server.Storage;

public sealed class SqliteSeenJobCache : ISeenJobCache, IAsyncDisposable, IDisposable
{
    private static readonly string[] JobParamNames = Enumerable.Range(0, 100)
        .Select(static i => $"$j{i}")
        .ToArray();

    private static readonly string[] PlatformParamNames = Enumerable.Range(0, 50)
        .Select(static i => $"$p{i}")
        .ToArray();

    private readonly string _connectionString;
    private readonly int _maxEntries;
    private readonly int _retentionDays;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<SqliteSeenJobCache> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private SqliteConnection? _connection;
    private bool _initialized;
    private bool _disposed;

    public SqliteSeenJobCache(
        IOptions<JobScraperOptions> options,
        TimeProvider timeProvider,
        ILogger<SqliteSeenJobCache> logger,
        IHostEnvironment? hostEnvironment = null)
    {
        var rawPath = string.IsNullOrWhiteSpace(options.Value.DbPath)
            ? "seen_jobs.db"
            : options.Value.DbPath;

        var dbPath = ResolveDbPath(rawPath, hostEnvironment);
        EnsureDirectoryExists(dbPath);

        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Pooling = true
        }.ToString();

        _maxEntries = Math.Max(100, options.Value.MaxSeenJobs);
        _retentionDays = Math.Max(1, options.Value.SeenJobRetentionDays);
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public static string ResolveDbPath(string rawPath, IHostEnvironment? hostEnvironment)
    {
        if (string.IsNullOrWhiteSpace(rawPath) || rawPath == ":memory:" || Path.IsPathRooted(rawPath))
        {
            return rawPath;
        }

        var baseDir = hostEnvironment?.ContentRootPath ?? AppContext.BaseDirectory;
        return Path.Combine(baseDir, rawPath);
    }

    // Constructor for testing with custom connection string
    public SqliteSeenJobCache(
        string connectionString,
        TimeProvider timeProvider,
        ILogger<SqliteSeenJobCache> logger,
        int maxEntries = 5000,
        int retentionDays = 14)
    {
        EnsureDirectoryExistsFromConnectionString(connectionString);
        _connectionString = connectionString;
        _timeProvider = timeProvider;
        _logger = logger;
        _maxEntries = Math.Max(100, maxEntries);
        _retentionDays = Math.Max(1, retentionDays);
    }

    private static void EnsureDirectoryExists(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath) || filePath == ":memory:")
        {
            return;
        }

        try
        {
            var fullPath = Path.GetFullPath(filePath);
            var dir = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
        }
        catch
        {
            // Best effort; let SqliteConnection fail with descriptive error if path is invalid
        }
    }

    private static void EnsureDirectoryExistsFromConnectionString(string connectionString)
    {
        try
        {
            var builder = new SqliteConnectionStringBuilder(connectionString);
            if (!string.IsNullOrWhiteSpace(builder.DataSource))
            {
                EnsureDirectoryExists(builder.DataSource);
            }
        }
        catch
        {
            // ignore
        }
    }

    private async ValueTask EnsureInitializedAsync(CancellationToken cancellationToken)
    {
        if (_initialized && _connection is not null)
        {
            return;
        }

        _connection = new SqliteConnection(_connectionString);
        await _connection.OpenAsync(cancellationToken);

        const string initSql = """
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA temp_store = MEMORY;
            PRAGMA cache_size = -2000;
            PRAGMA mmap_size = 67108864;
            CREATE TABLE IF NOT EXISTS SeenJobs (
                PlatformId TEXT NOT NULL,
                JobId TEXT NOT NULL,
                SeenAtUtc TEXT NOT NULL,
                PRIMARY KEY (PlatformId, JobId)
            );
            CREATE INDEX IF NOT EXISTS IX_SeenJobs_SeenAtUtc ON SeenJobs (SeenAtUtc);
            """;

        using var command = _connection.CreateCommand();
        command.CommandText = initSql;
        await command.ExecuteNonQueryAsync(cancellationToken);

        _initialized = true;
    }

    public async Task<IReadOnlySet<JobKey>> GetUnseenAsync(
        IReadOnlyCollection<JobKey> candidates,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (candidates.Count == 0)
        {
            return FrozenSet<JobKey>.Empty;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureInitializedAsync(cancellationToken);

            var seen = new HashSet<JobKey>();
            var byPlatform = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
            foreach (var candidate in candidates)
            {
                if (!byPlatform.TryGetValue(candidate.PlatformId, out var set))
                {
                    set = new HashSet<string>(StringComparer.Ordinal);
                    byPlatform[candidate.PlatformId] = set;
                }
                set.Add(candidate.JobId);
            }

            foreach (var (platformId, idSet) in byPlatform)
            {
                var jobIds = idSet.ToArray();
                for (var offset = 0; offset < jobIds.Length; offset += 100)
                {
                    var count = Math.Min(100, jobIds.Length - offset);
                    using var command = _connection!.CreateCommand();
                    command.Parameters.AddWithValue("$platformId", platformId);

                    for (var i = 0; i < count; i++)
                    {
                        command.Parameters.AddWithValue(JobParamNames[i], jobIds[offset + i]);
                    }

                    var inClause = string.Join(",", JobParamNames.Take(count));
                    command.CommandText = $"SELECT JobId FROM SeenJobs WHERE PlatformId = $platformId AND JobId IN ({inClause});";

                    using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        seen.Add(new JobKey(platformId, reader.GetString(0)));
                    }
                }
            }

            var unseen = new HashSet<JobKey>(candidates.Count);
            foreach (var candidate in candidates)
            {
                if (!seen.Contains(candidate))
                {
                    unseen.Add(candidate);
                }
            }

            return unseen;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task RememberAsync(
        IReadOnlyCollection<JobKey> keys,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (keys.Count == 0)
        {
            return;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            await EnsureInitializedAsync(cancellationToken);

            using var tx = (SqliteTransaction)await _connection!.BeginTransactionAsync(cancellationToken);

            var keyList = keys as IReadOnlyList<JobKey> ?? keys.ToArray();
            var nowIso = _timeProvider.GetUtcNow().UtcDateTime.ToString("O");

            for (var offset = 0; offset < keyList.Count; offset += 50)
            {
                var count = Math.Min(50, keyList.Count - offset);
                using var insertCmd = _connection!.CreateCommand();
                insertCmd.Transaction = tx;

                insertCmd.Parameters.AddWithValue("$seenAtUtc", nowIso);

                var valuesBuilder = new StringBuilder(count * 25);
                for (var i = 0; i < count; i++)
                {
                    var key = keyList[offset + i];
                    var pPlatform = PlatformParamNames[i];
                    var pJob = JobParamNames[i];

                    insertCmd.Parameters.AddWithValue(pPlatform, key.PlatformId);
                    insertCmd.Parameters.AddWithValue(pJob, key.JobId);

                    if (i > 0)
                    {
                        valuesBuilder.Append(',');
                    }

                    valuesBuilder.Append('(').Append(pPlatform).Append(',').Append(pJob).Append(",$seenAtUtc)");
                }

                insertCmd.CommandText = $"INSERT OR REPLACE INTO SeenJobs (PlatformId, JobId, SeenAtUtc) VALUES {valuesBuilder};";
                await insertCmd.ExecuteNonQueryAsync(cancellationToken);
            }

            // Expiration cleanup by retention days
            var cutoff = _timeProvider.GetUtcNow().AddDays(-_retentionDays).UtcDateTime.ToString("O");
            using var cleanupCmd = _connection.CreateCommand();
            cleanupCmd.Transaction = tx;
            cleanupCmd.CommandText = "DELETE FROM SeenJobs WHERE SeenAtUtc < $cutoff;";
            cleanupCmd.Parameters.AddWithValue("$cutoff", cutoff);
            var deleted = await cleanupCmd.ExecuteNonQueryAsync(cancellationToken);
            if (deleted > 0)
            {
                _logger.LogInformation("Pruned {DeletedCount} expired seen jobs older than {RetentionDays} days.", deleted, _retentionDays);
            }

            // Enforce max entry limit
            using var countCmd = _connection.CreateCommand();
            countCmd.Transaction = tx;
            countCmd.CommandText = "SELECT COUNT(*) FROM SeenJobs;";
            var totalCount = Convert.ToInt64(await countCmd.ExecuteScalarAsync(cancellationToken));
            if (totalCount > _maxEntries)
            {
                var excess = totalCount - _maxEntries;
                using var trimCmd = _connection.CreateCommand();
                trimCmd.Transaction = tx;
                trimCmd.CommandText = """
                    DELETE FROM SeenJobs WHERE rowid IN (
                        SELECT rowid FROM SeenJobs ORDER BY SeenAtUtc ASC LIMIT $excess
                    );
                    """;
                trimCmd.Parameters.AddWithValue("$excess", excess);
                await trimCmd.ExecuteNonQueryAsync(cancellationToken);
            }

            await tx.CommitAsync(cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        if (_connection is not null)
        {
            await _connection.DisposeAsync();
            _connection = null;
        }
        _gate.Dispose();
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _connection?.Dispose();
        _connection = null;
        _gate.Dispose();
    }
}
