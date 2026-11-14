using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using Rasid.Server.Contracts;
using Rasid.Server.Hubs;
using Rasid.Server.Models;
using Rasid.Server.Options;

namespace Rasid.Server.Endpoints;

public static class AdminBroadcastEndpoints
{
    public const string RateLimitPolicy = "AdminBroadcast";
    private const int MaxAdminBroadcastMessageLength = 1000;

    public static IEndpointRouteBuilder MapAdminBroadcastEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/admin/broadcast", async (
            [FromHeader(Name = "X-Admin-Token")] string? token,
            [FromBody] AdminMessageRequest? request,
            IOptions<AdminOptions> adminOptions,
            IHubContext<JobNotificationHub, IJobNotificationClient> hubContext,
            TimeProvider timeProvider,
            CancellationToken cancellationToken) =>
        {
            if (!AdminTokenComparer.Matches(token, adminOptions.Value.Token))
            {
                return Results.Unauthorized();
            }

            if (request is null || string.IsNullOrWhiteSpace(request.Message))
            {
                return Results.BadRequest(new { error = "Message is required." });
            }

            var message = request.Message.Trim();
            if (message.Length > MaxAdminBroadcastMessageLength)
            {
                return Results.BadRequest(new { error = $"Message must be {MaxAdminBroadcastMessageLength} characters or fewer." });
            }

            string? url = null;
            if (!string.IsNullOrWhiteSpace(request.Url))
            {
                if (!Uri.TryCreate(request.Url, UriKind.Absolute, out var uri) ||
                    (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
                {
                    return Results.BadRequest(new { error = "Url must be an absolute http or https URL." });
                }

                url = uri.ToString();
            }

            var payload = new AdminMessagePayload(
                Id: Guid.NewGuid().ToString(),
                Message: message,
                CreatedAt: timeProvider.GetUtcNow().UtcDateTime,
                Url: url);

            await hubContext.Clients.All.AdminMessageReceived(payload).WaitAsync(cancellationToken);

            return Results.Ok(new { success = true, broadcasted = true });
        }).RequireRateLimiting(RateLimitPolicy);

        return endpoints;
    }
}
