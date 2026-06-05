using HtmlAgilityPack;
using System.Text.RegularExpressions;
using Rasid.Server.Contracts;
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
        HttpClient httpClient,
        ILogger<KhamsatPlatformScraper> logger)
        : base(httpClient, logger, TimeSpan.FromSeconds(20))
    {
    }

    public override JobPlatformDescriptor Platform => Descriptor;

    public override async Task<ScrapeResult<IReadOnlyList<JobListing>>> FetchListingsAsync(
        CancellationToken cancellationToken)
    {
        var documentResult = await LoadDocumentAsync(WithCacheBuster(Platform.ListingUrl), cancellationToken);
        if (!documentResult.IsSuccess || documentResult.Value is null)
        {
            return documentResult.WithoutValue<IReadOnlyList<JobListing>>();
        }

        var jobs = new List<JobListing>();
        var seenIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var row in SelectNodes(documentResult.Value.DocumentNode, "//tr[contains(@class, 'forum_post')]"))
        {
            var titleLink = row.SelectSingleNode(
                ".//h3[contains(@class, 'details-head')]//a[contains(@href, '/community/requests/')]");
            var href = GetAttribute(titleLink, "href");
            var match = RequestIdRegex.Match(href ?? string.Empty);

            if (!match.Success || !seenIds.Add(match.Groups[1].Value))
            {
                continue;
            }

            var authorNode = row.SelectSingleNode(
                ".//td[contains(@class, 'details-td')]//a[contains(@class, 'user')]");
            var timeNode = row.SelectSingleNode(
                               ".//td[contains(@class, 'details-td')]//li[contains(@class, 'd-lg-inline-block')]//span[@title]") ??
                           row.SelectSingleNode(
                               ".//td[contains(@class, 'details-td')]//span[@title]");

            jobs.Add(new JobListing(
                Id: match.Groups[1].Value,
                PlatformId: Descriptor.Id,
                Title: CleanText(titleLink?.InnerText),
                Budget: string.Empty,
                Time: CleanText(timeNode?.InnerText),
                Url: AbsoluteUrl(BaseUrl, href),
                Poster: NullIfEmpty(authorNode?.InnerText),
                LastInteractionAt: NullIfEmpty(GetAttribute(timeNode, "title"))));
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

        var description = SelectLongestText(
            documentResult.Value,
            "//*[@itemprop='articleBody']",
            "//*[contains(@class, 'comment-body')]",
            "//*[contains(@class, 'topic-body')]",
            "//*[contains(@class, 'post-body')]",
            "//*[contains(@class, 'content-body')]",
            "//article",
            "//main//article",
            "//main//*[contains(@class, 'content')]");

        var timeNode = documentResult.Value.DocumentNode.SelectSingleNode(
            "//time[@datetime] | //time | //*[contains(@class, 'meta')]//time | //*[contains(@class, 'comment-time')]");
        var clientNameNode =
            documentResult.Value.DocumentNode.SelectSingleNode(
                "//*[@id='community_sidebar']//*[@id='sidebar']//a[contains(@class, 'sidebar_user')] | //*[@id='sidebar']//a[contains(@class, 'sidebar_user')]") ??
            documentResult.Value.DocumentNode.SelectSingleNode(
                "//*[contains(@class, 'comment-user')]//a | //*[contains(@class, 'post-author')]//*[contains(@class, 'username')] | //*[contains(@class, 'user-info')]//*[contains(@class, 'username')]");
        var sidebarPublishDate = SelectSidebarPublishDate(documentResult.Value);

        return ScrapeResult<JobDetails>.Success(
            new JobDetails(
                Description: NullIfEmpty(description),
                PostedAt: NullIfEmpty(
                    sidebarPublishDate ??
                    GetAttribute(timeNode, "datetime") ??
                    timeNode?.InnerText),
                ClientName: NullIfEmpty(clientNameNode?.InnerText)));
    }

    private static string? SelectLongestText(HtmlDocument document, params string[] xpaths) =>
        xpaths
            .SelectMany(xpath => SelectNodes(document.DocumentNode, xpath))
            .Select(node => CleanText(node.InnerText))
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .OrderByDescending(text => text.Length)
            .FirstOrDefault();

    private static string? SelectSidebarPublishDate(HtmlDocument document)
    {
        foreach (var sidebar in SelectNodes(
                     document.DocumentNode,
                     "//*[@id='community_sidebar']//*[@id='sidebar'] | //*[@id='sidebar']"))
        {
            foreach (var valueNode in SelectNodes(sidebar, ".//span[@title]"))
            {
                if (!HasPublishDateLabelNearby(valueNode))
                {
                    continue;
                }

                return NullIfEmpty(GetAttribute(valueNode, "title") ?? valueNode.InnerText);
            }
        }

        return null;
    }

    private static bool HasPublishDateLabelNearby(HtmlNode valueNode)
    {
        var current = valueNode.ParentNode;

        for (var depth = 0; current is not null && depth < 4; depth += 1)
        {
            if (CleanText(current.InnerText).Contains("تاريخ النشر", StringComparison.Ordinal))
            {
                return true;
            }

            current = current.ParentNode;
        }

        return false;
    }
}
