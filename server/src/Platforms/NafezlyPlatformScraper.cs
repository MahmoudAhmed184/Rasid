using System.Text.RegularExpressions;
using AngleSharp.Dom;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Rasid.Server.Contracts;
using Rasid.Server.Crawler;
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
        ICrawlerEngine crawlerEngine,
        ILogger<NafezlyPlatformScraper> logger,
        TimeProvider? timeProvider = null)
        : base(crawlerEngine, logger, timeProvider)
    {
    }

    // Overload for testing
    internal NafezlyPlatformScraper(
        HttpClient httpClient,
        ILogger<NafezlyPlatformScraper> logger,
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

        var doc = documentResult.Value;
        var jobs = new List<JobListing>();
        var seenIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var card in doc.QuerySelectorAll("div.project-box"))
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

        var doc = documentResult.Value;

        var descriptionBox = doc.QuerySelectorAll("div.main-nafez-box-styles")
            .FirstOrDefault(static b => b.TextContent.Contains("تفاصيل المشروع", StringComparison.Ordinal));
        var description = NullIfEmpty(descriptionBox?.QuerySelector("h2")?.TextContent);

        string? status = null;
        string? postedAt = null;
        string? duration = null;
        string? budget = null;
        string? bidsText = null;

        var metaBox = doc.QuerySelectorAll("div.main-nafez-box-styles")
            .FirstOrDefault(static b => b.TextContent.Contains("بطاقة المشروع", StringComparison.Ordinal));

        if (metaBox is not null)
        {
            foreach (var row in metaBox.QuerySelectorAll("div.row"))
            {
                var cells = row.Children.Where(static c => c.TagName.Equals("DIV", StringComparison.OrdinalIgnoreCase)).Take(2).ToArray();
                if (cells.Length < 2)
                {
                    continue;
                }

                var label = CleanText(cells[0].TextContent);
                var value = NullIfEmpty(cells[1].TextContent);

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
        }

        var clientBox = doc.QuerySelectorAll("div.main-nafez-box-styles")
            .FirstOrDefault(static b => b.TextContent.Contains("صاحب المشروع", StringComparison.Ordinal));
        var clientName = NullIfEmpty(clientBox?.QuerySelectorAll("a[href*='/u/']")
            .FirstOrDefault(static a => a.QuerySelector("img") is null)?.TextContent);

        var tags = doc.QuerySelectorAll("a.tag-class")
            .Select(static node => CleanText(node.TextContent))
            .Where(static tag => !string.IsNullOrWhiteSpace(tag))
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

    private static JobListing? TryParseListingCard(IElement card, HashSet<string> seenIds)
    {
        var titleLink = card.QuerySelector("a[href*='/project/'].text-truncate:not([href*='/project/create'])") ??
                        card.QuerySelector("a[href*='/project/']:not([href*='/project/create'])");
        var href = titleLink?.GetAttribute("href");
        var match = ProjectIdRegex.Match(href ?? string.Empty);

        if (!match.Success || !seenIds.Add(match.Groups[1].Value))
        {
            return null;
        }

        var descriptionNode = card.QuerySelector("h3.naskh");
        var posterNode = card.QuerySelectorAll("a[href*='/u/']").FirstOrDefault(static a => a.QuerySelector("img") is null);

        var spans = card.QuerySelectorAll("span");
        var budgetSpan = spans.FirstOrDefault(static s => s.QuerySelector(".fa-usd-circle") is not null);
        var durationSpan = spans.FirstOrDefault(static s => s.QuerySelector(".fa-business-time") is not null);
        var bidsSpan = spans.FirstOrDefault(static s => s.QuerySelector(".fa-ballot") is not null);
        var timeSpan = spans.FirstOrDefault(static s => s.QuerySelector(".fa-clock") is not null);

        var budget = CleanText(budgetSpan?.TextContent);
        var duration = NullIfEmpty(durationSpan?.TextContent);
        var bidsText = NullIfEmpty(bidsSpan?.TextContent);
        var time = CleanText(timeSpan?.TextContent);

        return new JobListing(
            Id: match.Groups[1].Value,
            PlatformId: Descriptor.Id,
            Title: CleanText(titleLink?.TextContent),
            Budget: string.IsNullOrWhiteSpace(budget) ? "غير محدد" : budget,
            Time: time,
            Url: AbsoluteUrl(BaseUrl, href),
            Poster: NullIfEmpty(posterNode?.TextContent),
            BidsText: bidsText,
            Description: NullIfEmpty(descriptionNode?.TextContent),
            Duration: duration);
    }
}
