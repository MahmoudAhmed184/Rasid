using System.Net;
using Rasid.Server.Platforms;

namespace Rasid.Server.Extensions;

public static class PlatformScraperServiceCollectionExtensions
{
    public static IServiceCollection AddPlatformScraper<TScraper>(this IServiceCollection services)
        where TScraper : class, IJobPlatformScraper
    {
        services.AddHttpClient<TScraper>()
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AutomaticDecompression = DecompressionMethods.All
            });

        services.AddTransient<IJobPlatformScraper>(sp => sp.GetRequiredService<TScraper>());
        return services;
    }
}
