using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using Rasid.Server.Contracts;
using Rasid.Server.Crawler;
using Rasid.Server.Options;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class CrawlerEngineTests
{
    [Fact]
    public void ChallengeDetector_IdentifiesVariousAntiBotChallenges()
    {
        // 202 Accepted
        using var resp202 = new HttpResponseMessage(HttpStatusCode.Accepted);
        Assert.True(ChallengeDetector.IsChallenge(resp202, "Accepted"));

        // AWS WAF header
        using var respWaf = new HttpResponseMessage(HttpStatusCode.Forbidden);
        respWaf.Headers.Add("x-amzn-waf-action", "challenge");
        Assert.True(ChallengeDetector.IsChallenge(respWaf, ""));

        // Cloudflare header
        using var respCf = new HttpResponseMessage(HttpStatusCode.Forbidden);
        respCf.Headers.Add("cf-mitigated", "challenge");
        Assert.True(ChallengeDetector.IsChallenge(respCf, ""));

        // Cloudflare challenge body
        using var resp403 = new HttpResponseMessage(HttpStatusCode.Forbidden);
        Assert.True(ChallengeDetector.IsChallenge(resp403, "<title>Just a moment...</title>"));

        // Normal 200 HTML page
        using var resp200 = new HttpResponseMessage(HttpStatusCode.OK);
        Assert.False(ChallengeDetector.IsChallenge(resp200, "<html><body><h1>Hello</h1></body></html>"));

        // Normal 200 HTML page with 'turnstile' in text should NOT be detected as challenge
        using var resp200Job = new HttpResponseMessage(HttpStatusCode.OK);
        Assert.False(ChallengeDetector.IsChallenge(resp200Job, "<html><body><h1>Job: Configure Turnstile on our WordPress site</h1></body></html>"));

        // Cloudflare turnstile challenge page
        using var resp403Turnstile = new HttpResponseMessage(HttpStatusCode.Forbidden);
        Assert.True(ChallengeDetector.IsChallenge(resp403Turnstile, "<html><head><script src='https://challenges.cloudflare.com/turnstile/v0/api.js'></script></head><body><div class='cf-turnstile'></div></body></html>"));
    }

    [Fact]
    public async Task CrawlerEngine_ReturnsSuccess_ForNormalHtmlResponse()
    {
        var html = "<html><head><title>Test Page</title></head><body><div class='item'>Project 1</div></body></html>";
        var client = new HttpClient(new StubHttpMessageHandler(HttpStatusCode.OK, html));
        var crawler = new CrawlerEngine(client, NullLogger<CrawlerEngine>.Instance);

        var result = await crawler.GetDocumentAsync("https://example.com/test", "test", CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal("Test Page", result.Value.Title);
        Assert.Equal("Project 1", result.Value.QuerySelector(".item")?.TextContent);
    }

    [Fact]
    public async Task CrawlerEngine_ReturnsNotFound_On404()
    {
        var client = new HttpClient(new StubHttpMessageHandler(HttpStatusCode.NotFound, "Not Found"));
        var crawler = new CrawlerEngine(client, NullLogger<CrawlerEngine>.Instance);

        var result = await crawler.GetDocumentAsync("https://example.com/missing", "test", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(ScrapeOutcomeKind.NotFound, result.Outcome);
    }

    [Fact]
    public async Task CrawlerEngine_ReturnsChallengeBlocked_OnBotChallengePage_WhenFallbackDisabled()
    {
        var challengeHtml = "<html><head><title>Just a moment...</title></head><body>Checking your browser...</body></html>";
        var client = new HttpClient(new StubHttpMessageHandler(HttpStatusCode.Forbidden, challengeHtml));
        var crawler = new CrawlerEngine(client, NullLogger<CrawlerEngine>.Instance);

        var result = await crawler.GetDocumentAsync("https://example.com/protected", "test", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(ScrapeOutcomeKind.ChallengeBlocked, result.Outcome);
    }

    [Fact]
    public async Task CrawlerEngine_InvokesHeadlessBrowserFallback_WhenChallengeEncountered()
    {
        var challengeHtml = "<html><head><title>Attention Required! | Cloudflare</title></head><body>Cloudflare turnstile</body></html>";
        var client = new HttpClient(new StubHttpMessageHandler(HttpStatusCode.Forbidden, challengeHtml));

        var fakeHeadless = new MockHeadlessBrowserService(
            "<html><head><title>Solved Page</title></head><body><div class='solved'>Content from browser</div></body></html>");

        var crawler = new CrawlerEngine(
            client,
            NullLogger<CrawlerEngine>.Instance,
            headlessBrowser: fakeHeadless,
            crawlerOptions: new CrawlerOptions { EnableHeadlessFallback = true });

        var result = await crawler.GetDocumentAsync("https://example.com/protected", "test", CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal("Solved Page", result.Value.Title);
        Assert.Equal("Content from browser", result.Value.QuerySelector(".solved")?.TextContent);
        Assert.Equal("https://example.com/protected", fakeHeadless.LastRequestedUrl);
    }

    [Fact]
    public async Task CrawlerEngine_ReturnsChallengeBlocked_WhenHeadlessFallbackFailsOrReturnsChallenge()
    {
        var challengeHtml = "<html><head><title>Just a moment...</title></head><body>Cloudflare challenge</body></html>";
        var client = new HttpClient(new StubHttpMessageHandler(HttpStatusCode.Forbidden, challengeHtml));

        // Fallback returns null (e.g. timeout or browser crash)
        var fakeHeadless = new MockHeadlessBrowserService(null);

        var crawler = new CrawlerEngine(
            client,
            NullLogger<CrawlerEngine>.Instance,
            headlessBrowser: fakeHeadless,
            crawlerOptions: new CrawlerOptions { EnableHeadlessFallback = true });

        var result = await crawler.GetDocumentAsync("https://example.com/protected", "test", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(ScrapeOutcomeKind.ChallengeBlocked, result.Outcome);
    }

    private sealed class MockHeadlessBrowserService(string? htmlToReturn) : IHeadlessBrowserService
    {
        public string? LastRequestedUrl { get; private set; }

        public Task<string?> FetchHtmlAsync(string url, CookieContainer cookieContainer, CancellationToken cancellationToken)
        {
            LastRequestedUrl = url;
            return Task.FromResult(htmlToReturn);
        }
    }

    private sealed class StubHttpMessageHandler(HttpStatusCode statusCode, string content) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(content)
            });
    }
}
