using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Rasid.Server.Endpoints;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/health", (TimeProvider timeProvider) => Results.Ok(new
        {
            status = "ok",
            serverTimeUtc = timeProvider.GetUtcNow().UtcDateTime,
            hubPath = "/jobNotificationHub"
        }));

        return endpoints;
    }
}
