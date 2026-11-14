using System.Text.RegularExpressions;
using AngleSharp.Dom;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Rasid.Server.Contracts;
using Rasid.Server.Crawler;
using Rasid.Server.Models;

namespace Rasid.Server.Platforms;

public sealed class KhamsatPlatformScraper : JobPlatformScraperBase
{
    private const string BaseUrl = "https://khamsat.com";
    private static readonly Regex RequestIdRegex = new(@"/community/requests/(\d+)", RegexOptions.Compiled);
    private static readonly JobPlatformDescriptor Descriptor = new(
        "khamsat",
        "Khamsat",
        "https://khamsat.com/community/requests");

    public KhamsatPlatformScraper(
        ICrawlerEngine crawlerEngine,
        ILogger<KhamsatPlatformScraper> logger,
        TimeProvider? timeProvider = null)
        : base(crawlerEngine, logger, timeProvider)
    {
    }

    // Overload for testing
    internal KhamsatPlatformScraper(
        HttpClient httpClient,
        ILogger<KhamsatPlatformScraper> logger,
        TimeProvider? timeProvider = null)
        : base(httpClient, logger, TimeSpan.FromSeconds(20), timeProvider)
    {
    }

    public override JobPlatformDescriptor Platform => Descriptor;

    public override async Task<ScrapeResult<IReadOnlyList<JobListing>>> FetchListingsAsync(
        CancellationToken cancellationToken)
    {
        var documentResult = await LoadDocumentAsync(WithCacheBuster(Platform.ListingUrl, TimeProvider), cancellationToken);
        if (!documentResult.IsSuccess || documentResult.Value is null)
        {
            return documentResult.WithoutValue<IReadOnlyList<JobListing>>();
        }

        var jobs = new List<JobListing>();
        var seenIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var row in documentResult.Value.QuerySelectorAll("tr.forum_post"))
        {
            var titleLink = row.QuerySelector(".details-head a[href*='/community/requests/']");
            var href = titleLink?.GetAttribute("href");
            var match = RequestIdRegex.Match(href ?? string.Empty);

            if (!match.Success || !seenIds.Add(match.Groups[1].Value))
            {
                continue;
            }

            var authorNode = row.QuerySelector(".details-td a.user");
            var timeNode = row.QuerySelector(".details-td li.d-lg-inline-block span[title]") ??
                           row.QuerySelector(".details-td span[title]");

            jobs.Add(new JobListing(
                Id: match.Groups[1].Value,
                PlatformId: Descriptor.Id,
                Title: CleanText(titleLink?.TextContent),
                Budget: string.Empty,
                Time: CleanText(timeNode?.TextContent),
                Url: AbsoluteUrl(BaseUrl, href),
                Poster: NullIfEmpty(authorNode?.TextContent),
                LastInteractionAt: NullIfEmpty(timeNode?.GetAttribute("title"))));
        }

        return ScrapeResult<IReadOnlyList<JobListing>>.Success(jobs);
    }

    public override async Task<ScrapeResult<JobDetails>> FetchDetailsAsync(
        JobListing listing,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(listing.Url) ||
            !listing.Url.StartsWith("http", StringComparison.OrdinalIgnoreCase))
        {
            return ScrapeResult<JobDetails>.Skipped("Listing URL is missing or invalid.");
        }

        var documentResult = await LoadDocumentAsync(listing.Url, cancellationToken);
        if (!documentResult.IsSuccess || documentResult.Value is null)
        {
            return documentResult.WithoutValue<JobDetails>();
        }

        var doc = documentResult.Value;

        var description = SelectLongestText(
            doc,
            ".card-body > article.replace_urls",
            "article.replace_urls",
            "[itemprop='articleBody']",
            ".topic-body",
            ".post-body",
            ".content-body",
            ".comment-body",
            "article",
            "main article",
            "main .content");

        var timeNode = doc.QuerySelector("time[datetime], time, .meta time, .comment-time");
        var clientNameNode = doc.QuerySelector("#community_sidebar #sidebar a.sidebar_user, #sidebar a.sidebar_user, .comment-user a, .post-author .username, .user-info .username");
        var sidebarPublishDate = SelectSidebarPublishDate(doc);

        return ScrapeResult<JobDetails>.Success(
            new JobDetails(
                Description: NullIfEmpty(description),
                PostedAt: NullIfEmpty(
                    sidebarPublishDate ??
                    timeNode?.GetAttribute("datetime") ??
                    timeNode?.TextContent),
                ClientName: NullIfEmpty(clientNameNode?.TextContent)));
    }

    private static string? SelectLongestText(IDocument document, params string[] selectors) =>
        selectors
            .SelectMany(selector => document.QuerySelectorAll(selector))
            .Select(static node => CleanText(node.TextContent))
            .Where(static text => !string.IsNullOrWhiteSpace(text))
            .OrderByDescending(static text => text.Length)
            .FirstOrDefault();

    private static string? SelectSidebarPublishDate(IDocument document)
    {
        foreach (var sidebar in document.QuerySelectorAll("#community_sidebar #sidebar, #sidebar"))
        {
            foreach (var valueNode in sidebar.QuerySelectorAll("span[title]"))
            {
                if (!HasPublishDateLabelNearby(valueNode))
                {
                    continue;
                }

                return NullIfEmpty(valueNode.GetAttribute("title") ?? valueNode.TextContent);
            }
        }

        return null;
    }

    private static bool HasPublishDateLabelNearby(IElement valueNode)
    {
        var current = valueNode.ParentElement;

        for (var depth = 0; current is not null && depth < 4; depth += 1)
        {
            if (CleanText(current.TextContent).Contains("تاريخ النشر", StringComparison.Ordinal))
            {
                return true;
            }

            current = current.ParentElement;
        }

        return false;
    }
}
