using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

namespace Rasid.Server.Endpoints;

public static class EndpointRouteExtensions
{
    public static IEndpointRouteBuilder MapRasidEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapHealthEndpoints();
        endpoints.MapProviderEndpoints();
        endpoints.MapAdminBroadcastEndpoints();
        endpoints.MapBroadcastToolEndpoints();

        return endpoints;
    }
}
