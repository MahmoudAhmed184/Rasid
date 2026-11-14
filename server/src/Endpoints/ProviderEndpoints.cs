using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Rasid.Server.Platforms;

namespace Rasid.Server.Endpoints;

public static class ProviderEndpoints
{
    public static IEndpointRouteBuilder MapProviderEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/providers", (IEnumerable<IJobPlatformScraper> scrapers) =>
            Results.Ok(scrapers.Select(static scraper => new
            {
                id = scraper.Platform.Id,
                name = scraper.Platform.DisplayName,
                listingUrl = scraper.Platform.ListingUrl
            })));

        return endpoints;
    }
}
