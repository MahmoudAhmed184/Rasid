using HtmlAgilityPack;
using System.Text.RegularExpressions;
using Rasid.Server.Contracts;
using Rasid.Server.Models;

namespace Rasid.Server.Platforms;

public sealed class NafezlyPlatformScraper : JobPlatformScraperBase
{
    private const string BaseUrl = "https://nafezly.com";
    private static readonly Regex ProjectIdRegex = new(@"/project/(\d+)", RegexOptions.Compiled);
    private static readonly JobPlatformDescriptor Descriptor = new(
        "nafezly",
        "Nafezly",
        "https://nafezly.com/projects");

    public NafezlyPlatformScraper(
        HttpClient httpClient,
        ILogger<NafezlyPlatformScraper> logger)
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

        foreach (var card in SelectNodes(
                     documentResult.Value.DocumentNode,
                     "//div[contains(concat(' ', normalize-space(@class), ' '), ' project-box ')]"))
        {
            var job = TryParseListingCard(card, seenIds);
            if (job is not null)
            {
                jobs.Add(job);
            }
        }

        return ScrapeResult<IReadOnlyList<JobListing>>.Success(jobs);
    }

    public override async Task<ScrapeResult<JobDetails>> FetchDetailsAsync(
        JobListing listing,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(listing.Url))
        {
            return ScrapeResult<JobDetails>.Skipped("Listing URL is missing.");
        }

        var documentResult = await LoadDocumentAsync(listing.Url, cancellationToken);
        if (!documentResult.IsSuccess || documentResult.Value is null)
        {
            return documentResult.WithoutValue<JobDetails>();
        }

        var description = NullIfEmpty(documentResult.Value.DocumentNode.SelectSingleNode(
            "//div[normalize-space()='تفاصيل المشروع']/ancestor::div[contains(@class, 'main-nafez-box-styles')][1]//h2")?.InnerText);

        string? status = null;
        string? postedAt = null;
        string? duration = null;
        string? budget = null;
        string? bidsText = null;

        foreach (var row in SelectNodes(
                     documentResult.Value.DocumentNode,
                     "//div[normalize-space()='بطاقة المشروع']/ancestor::div[contains(@class, 'main-nafez-box-styles')][1]//div[contains(@class, 'row') and contains(@style, 'padding:4px 5px')]"))
        {
            var cells = row.Elements("div").Take(2).ToArray();
            if (cells.Length < 2)
            {
                continue;
            }

            var label = CleanText(cells[0].InnerText);
            var value = NullIfEmpty(cells[1].InnerText);

            if (string.IsNullOrWhiteSpace(label) || value is null)
            {
                continue;
            }

            if (label.Contains("حالة المشروع", StringComparison.Ordinal))
            {
                status = value;
            }
            else if (label.Contains("تاريخ النشر", StringComparison.Ordinal))
            {
                postedAt = value;
            }
            else if (label.Contains("المدة المتاحة", StringComparison.Ordinal))
            {
                duration = value;
            }
            else if (label.Contains("الميزانية", StringComparison.Ordinal))
            {
                budget = value;
            }
            else if (label.Contains("عدد المتقدمين", StringComparison.Ordinal))
            {
                bidsText = value;
            }
        }

        var clientName = NullIfEmpty(documentResult.Value.DocumentNode.SelectSingleNode(
            "//span[normalize-space()='صاحب المشروع']/ancestor::div[contains(@class, 'main-nafez-box-styles')][1]//a[contains(@href, '/u/') and not(.//img)][1]")?.InnerText);

        var tags = SelectNodes(
                documentResult.Value.DocumentNode,
                "//a[contains(concat(' ', normalize-space(@class), ' '), ' tag-class ')]")
            .Select(node => CleanText(node.InnerText))
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return ScrapeResult<JobDetails>.Success(
            new JobDetails(
                Description: description,
                Status: status,
                Duration: duration,
                Budget: budget,
                ClientName: clientName,
                PostedAt: postedAt,
                BidsText: bidsText,
                Tags: tags.Length > 0 ? tags : null));
    }

    private static JobListing? TryParseListingCard(HtmlNode card, HashSet<string> seenIds)
    {
        var titleLink = card.SelectSingleNode(
            ".//a[contains(@href, '/project/') and contains(@class, 'text-truncate') and not(contains(@href, '/project/create'))][1]");
        var href = GetAttribute(titleLink, "href");
        var match = ProjectIdRegex.Match(href ?? string.Empty);

        if (!match.Success || !seenIds.Add(match.Groups[1].Value))
        {
            return null;
        }

        var descriptionNode = card.SelectSingleNode(".//h3[contains(@class, 'naskh')][1]");
        var posterNode = card.SelectSingleNode(
            ".//a[contains(@href, '/u/') and not(.//img)][1]");

        var budget = CleanText(card.SelectSingleNode(
            ".//span[.//span[contains(@class, 'fa-usd-circle')]][1]")?.InnerText);
        var duration = NullIfEmpty(card.SelectSingleNode(
            ".//span[.//span[contains(@class, 'fa-business-time')]][1]")?.InnerText);
        var bidsText = NullIfEmpty(card.SelectSingleNode(
            ".//span[.//span[contains(@class, 'fa-ballot')]][1]")?.InnerText);
        var time = CleanText(card.SelectSingleNode(
            ".//span[.//span[contains(@class, 'fa-clock')]][1]")?.InnerText);

        return new JobListing(
            Id: match.Groups[1].Value,
            PlatformId: Descriptor.Id,
            Title: CleanText(titleLink?.InnerText),
            Budget: string.IsNullOrWhiteSpace(budget) ? "غير محدد" : budget,
            Time: time,
            Url: AbsoluteUrl(BaseUrl, href),
            Poster: NullIfEmpty(posterNode?.InnerText),
            BidsText: bidsText,
            Description: NullIfEmpty(descriptionNode?.InnerText),
            Duration: duration);
    }
}
