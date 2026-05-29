namespace Rasid.Server.Services;

public interface IScrapeCycleRunner
{
    Task RunOnceAsync(CancellationToken cancellationToken);
}
