using Microsoft.Extensions.Logging.Abstractions;
using Rasid.Server.Contracts;
using Rasid.Server.Hubs;
using Rasid.Server.Models;
using Rasid.Server.Workers;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class JobChannelAndBroadcastingTests
{
    [Fact]
    public async Task JobChannel_TransfersItems_FromWriterToReader()
    {
        var channel = new JobChannel(10);
        var job = new JobListing(
            Id: "1",
            PlatformId: "khamsat",
            Title: "ترجمة فورية",
            Budget: "$25",
            Time: "الآن",
            Url: "https://khamsat.com/community/requests/1");

        await channel.Writer.WriteAsync(job, TestContext.Current.CancellationToken);

        Assert.True(channel.Reader.TryRead(out var readJob));
        Assert.NotNull(readJob);
        Assert.Equal("1", readJob.Id);
        Assert.Equal("ترجمة فورية", readJob.Title);
    }

    [Fact]
    public async Task JobBroadcastingWorker_BatchesAndBroadcastsJobsFromChannel()
    {
        var channel = new JobChannel(50);
        var mockBroadcaster = new RecordingJobBroadcaster();
        var worker = new JobBroadcastingWorker(
            channel,
            mockBroadcaster,
            TimeProvider.System,
            NullLogger<JobBroadcastingWorker>.Instance);

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);

        var workerTask = worker.StartAsync(cts.Token);

        var job1 = new JobListing("1", "mostaql", "موقع تجاري", "$200", "اليوم", "https://mostaql.com/project/1");
        var job2 = new JobListing("2", "nafezly", "تطبيق ويب", "$300", "اليوم", "https://nafezly.com/project/2");

        await channel.Writer.WriteAsync(job1, cts.Token);
        await channel.Writer.WriteAsync(job2, cts.Token);

        // Give the worker a moment to process the batch
        await Task.Delay(100, TestContext.Current.CancellationToken);

        await cts.CancelAsync();
        try
        {
            await worker.StopAsync(CancellationToken.None);
        }
        catch (OperationCanceledException)
        {
            // Expected
        }

        Assert.NotEmpty(mockBroadcaster.BroadcastMessages);
        var broadcastedJobs = mockBroadcaster.BroadcastMessages.SelectMany(m => m.Jobs).ToList();
        Assert.Contains(broadcastedJobs, j => j.Id == "1");
        Assert.Contains(broadcastedJobs, j => j.Id == "2");
    }

    private sealed class RecordingJobBroadcaster : IJobBroadcaster
    {
        public List<NewJobsDetectedMessage> BroadcastMessages { get; } = [];

        public Task BroadcastNewJobsAsync(NewJobsDetectedMessage message, CancellationToken cancellationToken)
        {
            BroadcastMessages.Add(message);
            return Task.CompletedTask;
        }
    }
}
