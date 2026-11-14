using System.Threading.Channels;
using Rasid.Server.Models;

namespace Rasid.Server.Workers;

public sealed class JobChannel
{
    private readonly Channel<JobListing> _channel;

    public JobChannel(int capacity = 2000)
    {
        var options = new BoundedChannelOptions(Math.Max(100, capacity))
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        };
        _channel = Channel.CreateBounded<JobListing>(options);
    }

    public ChannelWriter<JobListing> Writer => _channel.Writer;
    public ChannelReader<JobListing> Reader => _channel.Reader;
}
