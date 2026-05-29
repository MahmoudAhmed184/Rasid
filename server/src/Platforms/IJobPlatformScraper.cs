using Rasid.Server.Contracts;
using Rasid.Server.Models;

namespace Rasid.Server.Platforms;

public interface IJobListingSource
{
    JobPlatformDescriptor Platform { get; }

    Task<ScrapeResult<IReadOnlyList<JobListing>>> FetchListingsAsync(
        CancellationToken cancellationToken);
}

public interface IJobDetailsEnricher
{
    Task<ScrapeResult<JobDetails>> FetchDetailsAsync(
        JobListing listing,
        CancellationToken cancellationToken);
}

public interface IJobPlatformScraper : IJobListingSource, IJobDetailsEnricher
{
}
