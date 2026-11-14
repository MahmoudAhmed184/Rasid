using System.Buffers;
using System.Net;

namespace Rasid.Server.Crawler;

public static class ChallengeDetector
{
    private static readonly SearchValues<string> BotChallengeMarkers = SearchValues.Create(
        [
            "Just a moment...",
            "Attention Required! | Cloudflare",
            "cf-browser-verification",
            "cf_chl_",
            "__cf_chl_",
            "challenge-platform",
            "challenges.cloudflare.com/turnstile",
            "cf-turnstile",
            "x-amzn-waf-action",
            "ddos-guard"
        ],
        StringComparison.OrdinalIgnoreCase);

    public static bool IsChallenge(HttpResponseMessage response, string? body)
    {
        if ((int)response.StatusCode == 202)
        {
            return true;
        }

        if (response.Headers.TryGetValues("x-amzn-waf-action", out _))
        {
            return true;
        }

        if (response.Headers.TryGetValues("cf-mitigated", out _) ||
            response.Headers.TryGetValues("cf-chl-bypass", out _))
        {
            return true;
        }

        if (response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.ServiceUnavailable or HttpStatusCode.TooManyRequests)
        {
            if (response.Headers.Contains("cf-ray"))
            {
                return true;
            }

            if (body is not null && LooksLikeBotChallenge(body))
            {
                return true;
            }
        }

        return body is not null && LooksLikeBotChallenge(body);
    }

    public static bool LooksLikeBotChallenge(string html) =>
        !string.IsNullOrEmpty(html) && html.AsSpan().ContainsAny(BotChallengeMarkers);
}
