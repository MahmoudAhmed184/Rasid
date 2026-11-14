using Microsoft.Extensions.Logging.Abstractions;
using Rasid.Server.Contracts;
using Rasid.Server.Storage;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class SqliteSeenJobCacheTests
{
    [Fact]
    public async Task Cache_PersistsSeenJobs_AndFiltersUnseenAcrossInstances()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"rasid_test_{Guid.NewGuid():N}.db");
        var connectionString = $"Data Source={dbPath};";
        var timeProvider = TimeProvider.System;

        try
        {
            var key1 = new JobKey("mostaql", "101");
            var key2 = new JobKey("khamsat", "202");
            var key3 = new JobKey("nafezly", "303");

            // Instance 1: write key1 and key2
            await using (var cache1 = new SqliteSeenJobCache(
                connectionString,
                timeProvider,
                NullLogger<SqliteSeenJobCache>.Instance))
            {
                var initialUnseen = await cache1.GetUnseenAsync([key1, key2, key3], CancellationToken.None);
                Assert.Equal(3, initialUnseen.Count);

                await cache1.RememberAsync([key1, key2], CancellationToken.None);

                var afterUnseen = await cache1.GetUnseenAsync([key1, key2, key3], CancellationToken.None);
                Assert.Single(afterUnseen);
                Assert.Contains(key3, afterUnseen);
            }

            // Instance 2: reopen same SQLite DB, verify persistence
            await using (var cache2 = new SqliteSeenJobCache(
                connectionString,
                timeProvider,
                NullLogger<SqliteSeenJobCache>.Instance))
            {
                var persistedUnseen = await cache2.GetUnseenAsync([key1, key2, key3], CancellationToken.None);
                Assert.Single(persistedUnseen);
                Assert.Contains(key3, persistedUnseen);

                await cache2.RememberAsync([key3], CancellationToken.None);

                var allSeen = await cache2.GetUnseenAsync([key1, key2, key3], CancellationToken.None);
                Assert.Empty(allSeen);
            }
        }
        finally
        {
            if (File.Exists(dbPath))
            {
                try
                {
                    File.Delete(dbPath);
                }
                catch
                {
                    // ignore cleanup
                }
            }
        }
    }

    [Fact]
    public async Task Cache_PrunesExpiredEntries_BasedOnRetentionDays()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"rasid_expire_test_{Guid.NewGuid():N}.db");
        var connectionString = $"Data Source={dbPath};";
        var startTime = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var testTime = new TestTimeProvider(startTime);

        try
        {
            var keyOld = new JobKey("mostaql", "old-1");
            var keyNew = new JobKey("mostaql", "new-2");

            await using var cache = new SqliteSeenJobCache(
                connectionString,
                testTime,
                NullLogger<SqliteSeenJobCache>.Instance,
                maxEntries: 100,
                retentionDays: 7);

            // Remember keyOld at day 0
            await cache.RememberAsync([keyOld], CancellationToken.None);

            var unseenBefore = await cache.GetUnseenAsync([keyOld], CancellationToken.None);
            Assert.Empty(unseenBefore);

            // Advance 8 days past the 7-day retention window
            testTime.Advance(TimeSpan.FromDays(8));

            // Remember keyNew, which triggers retention pruning of older items
            await cache.RememberAsync([keyNew], CancellationToken.None);

            // keyOld must now be pruned and reported as unseen again
            var unseenAfter = await cache.GetUnseenAsync([keyOld, keyNew], CancellationToken.None);
            Assert.Single(unseenAfter);
            Assert.Contains(keyOld, unseenAfter);
        }
        finally
        {
            if (File.Exists(dbPath))
            {
                try
                {
                    File.Delete(dbPath);
                }
                catch
                {
                    // ignore
                }
            }
        }
    }

    [Fact]
    public async Task Cache_TrimsExcessEntries_WhenMaxEntriesExceeded()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"rasid_max_test_{Guid.NewGuid():N}.db");
        var connectionString = $"Data Source={dbPath};";
        var startTime = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var testTime = new TestTimeProvider(startTime);

        try
        {
            await using var cache = new SqliteSeenJobCache(
                connectionString,
                testTime,
                NullLogger<SqliteSeenJobCache>.Instance,
                maxEntries: 100, // min allowed
                retentionDays: 30);

            // Insert 105 entries with increasing timestamps
            for (var i = 1; i <= 105; i++)
            {
                testTime.Advance(TimeSpan.FromMinutes(1));
                await cache.RememberAsync([new JobKey("mostaql", $"job-{i}")], CancellationToken.None);
            }

            // Oldest 5 entries (job-1 through job-5) must have been trimmed
            var trimmedCandidates = Enumerable.Range(1, 5)
                .Select(i => new JobKey("mostaql", $"job-{i}"))
                .ToArray();

            var unseenTrimmed = await cache.GetUnseenAsync(trimmedCandidates, CancellationToken.None);
            Assert.Equal(5, unseenTrimmed.Count);

            // Recent entries (job-6 through job-105) must still be seen
            var recentCandidates = Enumerable.Range(6, 100)
                .Select(i => new JobKey("mostaql", $"job-{i}"))
                .ToArray();

            var unseenRecent = await cache.GetUnseenAsync(recentCandidates, CancellationToken.None);
            Assert.Empty(unseenRecent);
        }
        finally
        {
            if (File.Exists(dbPath))
            {
                try
                {
                    File.Delete(dbPath);
                }
                catch
                {
                    // ignore
                }
            }
        }
    }

    [Fact]
    public async Task Cache_CreatesSubdirectory_WhenDbPathIsInSubdirectory()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), $"rasid_subdir_{Guid.NewGuid():N}");
        var dbPath = Path.Combine(tempDir, "nested", "cache.db");
        var connectionString = $"Data Source={dbPath};";

        try
        {
            await using var cache = new SqliteSeenJobCache(
                connectionString,
                TimeProvider.System,
                NullLogger<SqliteSeenJobCache>.Instance);

            var key = new JobKey("khamsat", "999");
            await cache.RememberAsync([key], CancellationToken.None);

            var unseen = await cache.GetUnseenAsync([key], CancellationToken.None);
            Assert.Empty(unseen);
            Assert.True(File.Exists(dbPath));
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                try
                {
                    Directory.Delete(tempDir, true);
                }
                catch
                {
                    // ignore
                }
            }
        }
    }
}
