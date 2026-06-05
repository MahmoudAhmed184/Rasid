using HtmlAgilityPack;
using System.Net;
using Rasid.Server.Contracts;
using Rasid.Server.Models;

namespace Rasid.Server.Platforms;

public abstract class JobPlatformScraperBase : IJobPlatformScraper
{
    protected JobPlatformScraperBase(HttpClient httpClient, ILogger logger, TimeSpan timeout)
    {
        HttpClient = httpClient;
        Logger = logger;

        HttpClient.Timeout = timeout;
        HttpClient.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        HttpClient.DefaultRequestHeaders.Accept.ParseAdd(
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        HttpClient.DefaultRequestHeaders.AcceptLanguage.ParseAdd("ar,en;q=0.9");
    }

    protected HttpClient HttpClient { get; }
    protected ILogger Logger { get; }

    public abstract JobPlatformDescriptor Platform { get; }

    public abstract Task<ScrapeResult<IReadOnlyList<JobListing>>> FetchListingsAsync(
        CancellationToken cancellationToken);

    public abstract Task<ScrapeResult<JobDetails>> FetchDetailsAsync(
        JobListing listing,
        CancellationToken cancellationToken);

    protected async Task<ScrapeResult<HtmlDocument>> LoadDocumentAsync(
        string url,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await HttpClient.GetAsync(url, cancellationToken);

            if ((int)response.StatusCode == 202 &&
                response.Headers.TryGetValues("x-amzn-waf-action", out var actions))
            {
                Logger.LogWarning(
                    "Upstream WAF challenged {PlatformId} for {Url}. Actions: {Actions}",
                    Platform.Id,
                    url,
                    string.Join(", ", actions));

                return ScrapeResult<HtmlDocument>.ChallengeBlocked(
                    url,
                    $"WAF actions: {string.Join(", ", actions)}");
            }

            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                Logger.LogInformation(
                    "{PlatformId} returned 404 for {Url}.",
                    Platform.Id,
                    url);

                return ScrapeResult<HtmlDocument>.NotFound(url);
            }

            if (!response.IsSuccessStatusCode)
            {
                Logger.LogWarning(
                    "{PlatformId} request failed for {Url} with status code {StatusCode}.",
                    Platform.Id,
                    url,
                    response.StatusCode);

                return ScrapeResult<HtmlDocument>.Failed(
                    $"HTTP {(int)response.StatusCode} from upstream.",
                    url,
                    response.StatusCode);
            }

            var html = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(html))
            {
                Logger.LogWarning(
                    "{PlatformId} returned an empty HTML document for {Url}.",
                    Platform.Id,
                    url);

                return ScrapeResult<HtmlDocument>.Failed(
                    "Upstream returned an empty HTML document.",
                    url,
                    response.StatusCode,
                    ScrapeErrorKind.ParseFailure);
            }

            if (LooksLikeBotChallengePage(html))
            {
                Logger.LogWarning(
                    "{PlatformId} response for {Url} looks like an anti-bot challenge page.",
                    Platform.Id,
                    url);

                return ScrapeResult<HtmlDocument>.ChallengeBlocked(url);
            }

            var document = new HtmlDocument();
            document.LoadHtml(html);
            return ScrapeResult<HtmlDocument>.Success(document);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (HttpRequestException ex)
        {
            Logger.LogWarning(
                ex,
                "{PlatformId} request failed for {Url}.",
                Platform.Id,
                url);

            return ScrapeResult<HtmlDocument>.Failed(ex.Message, url);
        }
        catch (Exception ex)
        {
            Logger.LogError(
                ex,
                "Unexpected scraper failure for {PlatformId} at {Url}.",
                Platform.Id,
                url);

            return ScrapeResult<HtmlDocument>.Failed(
                ex.Message,
                url,
                null,
                ScrapeErrorKind.Unknown);
        }
    }

    protected static IEnumerable<HtmlNode> SelectNodes(HtmlNode node, string xpath) =>
        node.SelectNodes(xpath) ?? Enumerable.Empty<HtmlNode>();

    protected static string WithCacheBuster(string url)
    {
        var separator = url.Contains('?', StringComparison.Ordinal) ? "&" : "?";
        return $"{url}{separator}_cb={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
    }

    protected static string AbsoluteUrl(string baseUrl, string? href)
    {
        if (string.IsNullOrWhiteSpace(href))
        {
            return string.Empty;
        }

        if (Uri.TryCreate(href, UriKind.Absolute, out var absoluteUri) &&
            (absoluteUri.Scheme == Uri.UriSchemeHttp || absoluteUri.Scheme == Uri.UriSchemeHttps))
        {
            return absoluteUri.ToString();
        }

        return new Uri(new Uri(baseUrl), href).ToString();
    }

    protected static string? GetAttribute(HtmlNode? node, string attributeName) =>
        node?.Attributes[attributeName]?.Value;

    protected static string CleanText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return WebUtility.HtmlDecode(value)
            .Replace('\n', ' ')
            .Replace('\r', ' ')
            .Replace('\t', ' ')
            .Trim();
    }

    protected static string? NullIfEmpty(string? value)
    {
        var cleaned = CleanText(value);
        return string.IsNullOrWhiteSpace(cleaned) ? null : cleaned;
    }

    private static bool LooksLikeBotChallengePage(string html) =>
        html.Contains("Just a moment", StringComparison.OrdinalIgnoreCase) ||
        html.Contains("Attention Required", StringComparison.OrdinalIgnoreCase) ||
        html.Contains("cf-browser-verification", StringComparison.OrdinalIgnoreCase) ||
        html.Contains("cf_chl_", StringComparison.OrdinalIgnoreCase) ||
        html.Contains("__cf_chl_", StringComparison.OrdinalIgnoreCase) ||
        html.Contains("challenge-platform", StringComparison.OrdinalIgnoreCase);
}
