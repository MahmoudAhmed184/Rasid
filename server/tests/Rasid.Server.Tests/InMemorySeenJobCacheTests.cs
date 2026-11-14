using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Rasid.Server.Contracts;
using Rasid.Server.Options;
using Rasid.Server.Storage;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class InMemorySeenJobCacheTests
{
    [Fact]
    public async Task GetUnseenAsync_ReturnsOnlyUnseenKeys()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new JobScraperOptions { MaxSeenJobs = 100 });
        var cache = new InMemorySeenJobCache(options);
        var cancellationToken = TestContext.Current.CancellationToken;

        var key1 = new JobKey("mostaql", "101");
        var key2 = new JobKey("mostaql", "102");
        var key3 = new JobKey("khamsat", "201");

        await cache.RememberAsync([key1, key2], cancellationToken);

        var unseen = await cache.GetUnseenAsync([key1, key2, key3], cancellationToken);

        Assert.Single(unseen);
        Assert.Contains(key3, unseen);
    }

    [Fact]
    public async Task RememberAsync_EvictsOldestEntries_WhenMaxEntriesExceeded()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new JobScraperOptions { MaxSeenJobs = 2 });
        var cache = new InMemorySeenJobCache(options);
        var cancellationToken = TestContext.Current.CancellationToken;

        var key1 = new JobKey("mostaql", "1");
        var key2 = new JobKey("mostaql", "2");
        var key3 = new JobKey("mostaql", "3");

        await cache.RememberAsync([key1, key2], cancellationToken);
        await cache.RememberAsync([key3], cancellationToken);

        // key1 should have been evicted because MaxSeenJobs is 2
        var unseen = await cache.GetUnseenAsync([key1, key2, key3], cancellationToken);

        Assert.Single(unseen);
        Assert.Contains(key1, unseen);
    }

    [Fact]
    public void SqliteSeenJobCache_ResolveDbPath_RootsRelativeToHostEnvironment()
    {
        var fakeEnv = new FakeHostEnvironment { ContentRootPath = "/var/www/rasid" };

        var relativeResult = SqliteSeenJobCache.ResolveDbPath("App_Data/seen_jobs.db", fakeEnv);
        Assert.Equal("/var/www/rasid/App_Data/seen_jobs.db", relativeResult);

        var rootedResult = SqliteSeenJobCache.ResolveDbPath("/absolute/path/jobs.db", fakeEnv);
        Assert.Equal("/absolute/path/jobs.db", rootedResult);

        var memoryResult = SqliteSeenJobCache.ResolveDbPath(":memory:", fakeEnv);
        Assert.Equal(":memory:", memoryResult);
    }

    [Fact]
    public void ServiceResolution_UsesInMemoryCache_WhenFlagIsTrue()
    {
        using var factory = new RasidServerApplicationFactory(
            settings: new Dictionary<string, string?>
            {
                ["AdminToken"] = "local-test-admin-token",
                ["JobScraper:UseInMemoryCache"] = "true"
            });

        using var scope = factory.Services.CreateScope();
        var cache = scope.ServiceProvider.GetRequiredService<ISeenJobCache>();

        Assert.IsType<InMemorySeenJobCache>(cache);
    }

    [Fact]
    public void ServiceResolution_UsesSqliteCache_ByDefault()
    {
        var tempFile = Path.Combine(Path.GetTempPath(), $"test_jobs_{Guid.NewGuid():N}.db");
        try
        {
            using var factory = new RasidServerApplicationFactory(
                settings: new Dictionary<string, string?>
                {
                    ["AdminToken"] = "local-test-admin-token",
                    ["JobScraper:DbPath"] = tempFile
                });

            using var scope = factory.Services.CreateScope();
            var cache = scope.ServiceProvider.GetRequiredService<ISeenJobCache>();

            Assert.IsType<SqliteSeenJobCache>(cache);
        }
        finally
        {
            if (File.Exists(tempFile))
            {
                File.Delete(tempFile);
            }
        }
    }

    private sealed class FakeHostEnvironment : Microsoft.Extensions.Hosting.IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "Rasid.Server";
        public string ContentRootPath { get; set; } = "/var/www/rasid";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
