using Rasid.Server.Contracts;
using Rasid.Server.Models;

namespace Rasid.Server.Platforms;

public interface IJobPlatformScraper
{
    JobPlatformDescriptor Platform { get; }

    Task<ScrapeResult<IReadOnlyList<JobListing>>> FetchListingsAsync(CancellationToken cancellationToken);

    Task<ScrapeResult<JobDetails>> FetchDetailsAsync(JobListing listing, CancellationToken cancellationToken);
}
