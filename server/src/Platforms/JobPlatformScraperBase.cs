using System.Net;
using AngleSharp.Dom;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Rasid.Server.Contracts;
using Rasid.Server.Crawler;
using Rasid.Server.Models;

namespace Rasid.Server.Platforms;

public abstract class JobPlatformScraperBase : IJobPlatformScraper
{
    protected JobPlatformScraperBase(
        ICrawlerEngine crawlerEngine,
        ILogger logger,
        TimeProvider? timeProvider = null)
    {
        CrawlerEngine = crawlerEngine;
        Logger = logger;
        TimeProvider = timeProvider ?? TimeProvider.System;
    }

    // Overload for backward compatibility with existing tests
    protected JobPlatformScraperBase(
        HttpClient httpClient,
        ILogger logger,
        TimeSpan timeout,
        TimeProvider? timeProvider = null)
        : this(new CrawlerEngine(httpClient, NullLogger<CrawlerEngine>.Instance), logger, timeProvider)
    {
    }

    protected ICrawlerEngine CrawlerEngine { get; }
    protected ILogger Logger { get; }
    protected TimeProvider TimeProvider { get; }

    public abstract JobPlatformDescriptor Platform { get; }

    public abstract Task<ScrapeResult<IReadOnlyList<JobListing>>> FetchListingsAsync(CancellationToken cancellationToken);

    public abstract Task<ScrapeResult<JobDetails>> FetchDetailsAsync(JobListing listing, CancellationToken cancellationToken);

    protected async Task<ScrapeResult<IDocument>> LoadDocumentAsync(string url, CancellationToken cancellationToken) =>
        await CrawlerEngine.GetDocumentAsync(url, Platform.Id, cancellationToken);

    protected static string WithCacheBuster(string url, TimeProvider timeProvider)
    {
        var separator = url.Contains('?', StringComparison.Ordinal) ? "&" : "?";
        return $"{url}{separator}_cb={timeProvider.GetUtcNow().ToUnixTimeMilliseconds()}";
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

    protected static string CleanText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var decoded = WebUtility.HtmlDecode(value);
        if (!decoded.AsSpan().ContainsAny('\n', '\r', '\t'))
        {
            return decoded.Trim();
        }

        return string.Create(decoded.Length, decoded, static (span, state) =>
        {
            state.AsSpan().CopyTo(span);
            for (var i = 0; i < span.Length; i++)
            {
                if (span[i] is '\n' or '\r' or '\t')
                {
                    span[i] = ' ';
                }
            }
        }).Trim();
    }

    protected static string? NullIfEmpty(string? value)
    {
        var cleaned = CleanText(value);
        return string.IsNullOrWhiteSpace(cleaned) ? null : cleaned;
    }
}
