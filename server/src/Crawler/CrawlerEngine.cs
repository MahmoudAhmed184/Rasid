using System.Net;
using AngleSharp;
using AngleSharp.Dom;
using AngleSharp.Html.Parser;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Rasid.Server.Contracts;
using Rasid.Server.Options;

namespace Rasid.Server.Crawler;

public sealed class CrawlerEngine : ICrawlerEngine
{
    private static readonly HtmlParser HtmlParserInstance = new();
    private readonly IHttpClientFactory? _httpClientFactory;
    private readonly HttpClient? _directHttpClient;
    private readonly CookieContainer _cookieContainer;
    private readonly PerDomainRateLimiter? _rateLimiter;
    private readonly IHeadlessBrowserService? _headlessBrowser;
    private readonly IOptions<CrawlerOptions> _options;
    private readonly ILogger<CrawlerEngine> _logger;

    public CrawlerEngine(
        IHttpClientFactory httpClientFactory,
        CookieContainer cookieContainer,
        PerDomainRateLimiter rateLimiter,
        IHeadlessBrowserService headlessBrowser,
        IOptions<CrawlerOptions> options,
        ILogger<CrawlerEngine> logger)
    {
        _httpClientFactory = httpClientFactory;
        _cookieContainer = cookieContainer;
        _rateLimiter = rateLimiter;
        _headlessBrowser = headlessBrowser;
        _options = options;
        _logger = logger;
    }

    // Internal constructor for testing or standalone use with direct HttpClient
    internal CrawlerEngine(
        HttpClient directHttpClient,
        ILogger<CrawlerEngine> logger,
        CookieContainer? cookieContainer = null,
        IHeadlessBrowserService? headlessBrowser = null,
        PerDomainRateLimiter? rateLimiter = null,
        CrawlerOptions? crawlerOptions = null)
    {
        _directHttpClient = directHttpClient;
        _cookieContainer = cookieContainer ?? new CookieContainer();
        _headlessBrowser = headlessBrowser;
        _rateLimiter = rateLimiter;
        _options = Microsoft.Extensions.Options.Options.Create(crawlerOptions ?? new CrawlerOptions { EnableHeadlessFallback = headlessBrowser is not null });
        _logger = logger;
    }

    public CookieContainer CookieContainer => _cookieContainer;

    public async Task<ScrapeResult<IDocument>> GetDocumentAsync(
        string url,
        string platformId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return ScrapeResult<IDocument>.Failed("Invalid URL", url);
        }

        if (_rateLimiter is not null)
        {
            await _rateLimiter.DelayIfNeededAsync(uri, cancellationToken);
        }

        var client = _directHttpClient ?? _httpClientFactory!.CreateClient("RasidCrawler");

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            request.Headers.UserAgent.ParseAdd(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
            request.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            request.Headers.AcceptLanguage.ParseAdd("ar,en;q=0.9");

            using var response = await client.SendAsync(request, cancellationToken);

            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                _logger.LogInformation("{PlatformId} returned 404 for {Url}.", platformId, url);
                return ScrapeResult<IDocument>.NotFound(url);
            }

            var html = await response.Content.ReadAsStringAsync(cancellationToken);

            var isChallenge = ChallengeDetector.IsChallenge(response, html);
            if (isChallenge)
            {
                _logger.LogWarning("{PlatformId} encountered anti-bot challenge for {Url} (Status {StatusCode}).",
                    platformId, url, (int)response.StatusCode);

                if (_options.Value.EnableHeadlessFallback && _headlessBrowser is not null)
                {
                    var fallbackHtml = await _headlessBrowser.FetchHtmlAsync(url, _cookieContainer, cancellationToken);
                    if (!string.IsNullOrWhiteSpace(fallbackHtml) && !ChallengeDetector.LooksLikeBotChallenge(fallbackHtml))
                    {
                        var fallbackDoc = await HtmlParserInstance.ParseDocumentAsync(fallbackHtml, cancellationToken);
                        return ScrapeResult<IDocument>.Success(fallbackDoc);
                    }
                }

                return ScrapeResult<IDocument>.ChallengeBlocked(url);
            }

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("{PlatformId} request failed for {Url} with status code {StatusCode}.",
                    platformId, url, response.StatusCode);

                return ScrapeResult<IDocument>.Failed(
                    $"HTTP {(int)response.StatusCode} from upstream.",
                    url,
                    response.StatusCode);
            }

            if (string.IsNullOrWhiteSpace(html))
            {
                _logger.LogWarning("{PlatformId} returned an empty HTML document for {Url}.", platformId, url);
                return ScrapeResult<IDocument>.Failed(
                    "Upstream returned an empty HTML document.",
                    url,
                    response.StatusCode,
                    ScrapeErrorKind.ParseFailure);
            }

            var document = await HtmlParserInstance.ParseDocumentAsync(html, cancellationToken);
            return ScrapeResult<IDocument>.Success(document);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "{PlatformId} request failed for {Url}.", platformId, url);
            return ScrapeResult<IDocument>.Failed(ex.Message, url);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected crawler failure for {PlatformId} at {Url}.", platformId, url);
            return ScrapeResult<IDocument>.Failed(ex.Message, url, null, ScrapeErrorKind.Unknown);
        }
    }
}
