using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Rasid.Server.Platforms;

public static class PlatformScraperServiceCollectionExtensions
{
    public static IServiceCollection AddPlatformScraper<TScraper>(this IServiceCollection services)
        where TScraper : class, IJobPlatformScraper
    {
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IJobPlatformScraper, TScraper>());
        return services;
    }
}
