namespace Rasid.Server.Workers;

public interface IScrapeCycleRunner
{
    Task RunOnceAsync(CancellationToken cancellationToken);
}
