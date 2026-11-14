using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using Rasid.Server.Contracts;
using Rasid.Server.Hubs;
using Rasid.Server.Models;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class JobNotificationHubTests
{
    [Fact]
    public async Task OnConnectedAsync_SendsConnectedPayloadToCaller()
    {
        var testTime = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new TestTimeProvider(testTime);
        var hub = new JobNotificationHub(NullLogger<JobNotificationHub>.Instance, timeProvider);

        var mockCaller = new MockJobNotificationClient();
        var mockClients = new MockHubCallerClients(mockCaller);
        var mockContext = new MockHubCallerContext("test-connection-123");

        hub.Clients = mockClients;
        hub.Context = mockContext;

        await hub.OnConnectedAsync();

        Assert.NotNull(mockCaller.LastConnected);
        Assert.Equal("test-connection-123", mockCaller.LastConnected.ConnectionId);
        Assert.Equal(testTime.UtcDateTime, mockCaller.LastConnected.Timestamp);
    }

    [Fact]
    public async Task Ping_SendsPongWithCurrentTime()
    {
        var testTime = new DateTimeOffset(2026, 6, 1, 12, 34, 56, TimeSpan.Zero);
        var timeProvider = new TestTimeProvider(testTime);
        var hub = new JobNotificationHub(NullLogger<JobNotificationHub>.Instance, timeProvider);

        var mockCaller = new MockJobNotificationClient();
        hub.Clients = new MockHubCallerClients(mockCaller);
        hub.Context = new MockHubCallerContext("test-connection-456");

        await hub.Ping();

        Assert.Equal(testTime.UtcDateTime, mockCaller.LastPong);
    }

    [Fact]
    public async Task Ping_HandlesClientDropGracefully_WhenCallerThrows()
    {
        var testTime = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new TestTimeProvider(testTime);
        var hub = new JobNotificationHub(NullLogger<JobNotificationHub>.Instance, timeProvider);

        var throwingCaller = new ThrowingJobNotificationClient();
        hub.Clients = new MockHubCallerClients(throwingCaller);
        hub.Context = new MockHubCallerContext("test-connection-drop");

        // Must not throw when caller drops immediately during ping/pong
        var exception = await Record.ExceptionAsync(() => hub.Ping());
        Assert.Null(exception);
    }

    [Fact]
    public async Task OnConnectedAsync_HandlesClientDropGracefully_WhenCallerThrows()
    {
        var testTime = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new TestTimeProvider(testTime);
        var hub = new JobNotificationHub(NullLogger<JobNotificationHub>.Instance, timeProvider);

        var throwingCaller = new ThrowingJobNotificationClient();
        hub.Clients = new MockHubCallerClients(throwingCaller);
        hub.Context = new MockHubCallerContext("test-connection-drop");

        // Must not throw when caller drops immediately
        var exception = await Record.ExceptionAsync(() => hub.OnConnectedAsync());
        Assert.Null(exception);
    }

    [Fact]
    public async Task OnDisconnectedAsync_CompletesCleanly_WithOrWithoutException()
    {
        var hub = new JobNotificationHub(NullLogger<JobNotificationHub>.Instance, TimeProvider.System);
        hub.Context = new MockHubCallerContext("test-connection-disc");

        var ex1 = await Record.ExceptionAsync(() => hub.OnDisconnectedAsync(null));
        Assert.Null(ex1);

        var ex2 = await Record.ExceptionAsync(() => hub.OnDisconnectedAsync(new InvalidOperationException("Connection lost")));
        Assert.Null(ex2);
    }

    [Fact]
    public void JobListingPayload_And_NewJobsDetectedPayload_SerializeExpectedContract()
    {
        var now = new DateTime(2026, 6, 1, 12, 0, 0, DateTimeKind.Utc);
        var job = new JobListing(
            Id: "101",
            PlatformId: "mostaql",
            Title: "تطوير موقع",
            Budget: "$500",
            Time: "اليوم",
            Url: "https://mostaql.com/project/101",
            Poster: "أحمد",
            PostedAt: "2026-06-01T10:00:00Z",
            Description: "تفاصيل",
            Tags: ["c#", "dotnet"]);

        var jobPayload = JobListingPayload.From(job);
        Assert.Equal("101", jobPayload.Id);
        Assert.Equal("mostaql", jobPayload.PlatformId);
        Assert.Equal("تطوير موقع", jobPayload.Title);
        Assert.Equal("$500", jobPayload.Budget);
        Assert.Equal(["c#", "dotnet"], jobPayload.Tags);

        var detected = new NewJobsDetectedPayload(
            Timestamp: now,
            Count: 1,
            Platforms: ["mostaql"],
            Jobs: [jobPayload]);

        Assert.Equal(1, detected.Count);
        Assert.Equal("mostaql", detected.Platforms[0]);
        Assert.Single(detected.Jobs);
    }

    private sealed class ThrowingJobNotificationClient : IJobNotificationClient
    {
        public Task Connected(ConnectedPayload message) =>
            throw new HubException("Client dropped connection immediately.");
        public Task NewJobsDetected(NewJobsDetectedPayload message) => Task.CompletedTask;
        public Task AdminMessageReceived(AdminMessagePayload message) => Task.CompletedTask;
        public Task Pong(DateTime timestamp) =>
            throw new HubException("Client dropped connection before receiving pong.");
    }

    private sealed class MockJobNotificationClient : IJobNotificationClient
    {
        public ConnectedPayload? LastConnected { get; private set; }
        public DateTime? LastPong { get; private set; }
        public AdminMessagePayload? LastAdminMessage { get; private set; }
        public NewJobsDetectedPayload? LastNewJobs { get; private set; }

        public Task Connected(ConnectedPayload message)
        {
            LastConnected = message;
            return Task.CompletedTask;
        }

        public Task NewJobsDetected(NewJobsDetectedPayload message)
        {
            LastNewJobs = message;
            return Task.CompletedTask;
        }

        public Task AdminMessageReceived(AdminMessagePayload message)
        {
            LastAdminMessage = message;
            return Task.CompletedTask;
        }

        public Task Pong(DateTime timestamp)
        {
            LastPong = timestamp;
            return Task.CompletedTask;
        }
    }

    private sealed class MockHubCallerClients(IJobNotificationClient caller) : IHubCallerClients<IJobNotificationClient>
    {
        public IJobNotificationClient Caller => caller;
        public IJobNotificationClient Others => caller;
        public IJobNotificationClient All => caller;
        public IJobNotificationClient AllExcept(IReadOnlyList<string> excludedConnectionIds) => caller;
        public IJobNotificationClient Client(string connectionId) => caller;
        public IJobNotificationClient Clients(IReadOnlyList<string> connectionIds) => caller;
        public IJobNotificationClient Group(string groupName) => caller;
        public IJobNotificationClient Groups(IReadOnlyList<string> groupNames) => caller;
        public IJobNotificationClient GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => caller;
        public IJobNotificationClient User(string userId) => caller;
        public IJobNotificationClient Users(IReadOnlyList<string> userIds) => caller;
        public IJobNotificationClient OthersInGroup(string groupName) => caller;
    }

    private sealed class MockHubCallerContext(string connectionId) : HubCallerContext
    {
        public override string ConnectionId => connectionId;
        public override string? UserIdentifier => null;
        public override System.Security.Claims.ClaimsPrincipal? User => null;
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => CancellationToken.None;
        public override void Abort() { }
    }

    private sealed class FeatureCollection : Microsoft.AspNetCore.Http.Features.IFeatureCollection
    {
        private readonly Dictionary<Type, object> _features = [];
        public object? this[Type key]
        {
            get => _features.GetValueOrDefault(key);
            set
            {
                if (value is null) _features.Remove(key);
                else _features[key] = value;
            }
        }
        public bool IsReadOnly => false;
        public int Revision => 0;
        public TFeature? Get<TFeature>() => (TFeature?)this[typeof(TFeature)];
        public void Set<TFeature>(TFeature? instance) => this[typeof(TFeature)] = instance;
        public IEnumerator<KeyValuePair<Type, object>> GetEnumerator() => _features.GetEnumerator();
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => _features.GetEnumerator();
    }
}
