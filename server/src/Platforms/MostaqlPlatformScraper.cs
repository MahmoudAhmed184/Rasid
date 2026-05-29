using HtmlAgilityPack;
using System.Text.RegularExpressions;
using Rasid.Server.Contracts;
using Rasid.Server.Models;

namespace Rasid.Server.Platforms;

public sealed class MostaqlPlatformScraper : JobPlatformScraperBase
{
    private const string BaseUrl = "https://mostaql.com";
    private static readonly Regex ProjectIdRegex = new(@"/project/(\d+)", RegexOptions.Compiled);
    private static readonly JobPlatformDescriptor Descriptor = new(
        "mostaql",
        "Mostaql",
        "https://mostaql.com/projects?sort=latest");

    public MostaqlPlatformScraper(
        HttpClient httpClient,
        ILogger<MostaqlPlatformScraper> logger)
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

        foreach (var row in SelectNodes(documentResult.Value.DocumentNode, "//tr[contains(@class, 'project-row')]"))
        {
            var job = TryParseProjectRow(row, seenIds);
            if (job is not null)
            {
                jobs.Add(job);
            }
        }

        if (jobs.Count == 0)
        {
            foreach (var row in SelectNodes(
                         documentResult.Value.DocumentNode,
                         "//tr[.//a[contains(@href, '/project/')]]"))
            {
                var job = TryParseClassicRow(row, seenIds);
                if (job is not null)
                {
                    jobs.Add(job);
                }
            }
        }

        if (jobs.Count == 0)
        {
            foreach (var link in SelectNodes(
                         documentResult.Value.DocumentNode,
                         "//a[contains(@href, '/project/') and not(contains(@href, '/project/create'))]"))
            {
                var job = TryParseFallbackLink(link, seenIds);
                if (job is not null)
                {
                    jobs.Add(job);
                }
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

        var document = documentResult.Value;
        var status = NullIfEmpty(document.DocumentNode
            .SelectSingleNode("//span[contains(@class, 'label-prj')]")
            ?.InnerText);
        var description = NullIfEmpty(document.DocumentNode
            .SelectSingleNode("//div[contains(@class, 'project-post__body')]")
            ?.InnerText);

        string? communications = null;
        string? hiringRate = null;
        string? duration = null;
        string? budget = null;
        string? registrationDate = null;

        foreach (var row in SelectNodes(
                     document.DocumentNode,
                     "//tr[contains(@class, 'meta-row')] | //table[contains(@class, 'table-meta')]//tr"))
        {
            var text = CleanText(row.InnerText);
            var value = NullIfEmpty(row.SelectSingleNode(
                ".//td[contains(@class, 'meta-value')] | .//td[last()]")?.InnerText);

            if (value is null)
            {
                continue;
            }

            if (text.Contains("التواصلات الجارية", StringComparison.Ordinal))
            {
                communications = value;
            }
            else if (text.Contains("معدل التوظيف", StringComparison.Ordinal))
            {
                hiringRate = value;
            }
            else if (text.Contains("مدة التنفيذ", StringComparison.Ordinal))
            {
                duration = value;
            }
            else if (text.Contains("الميزانية", StringComparison.Ordinal))
            {
                budget = value;
            }
            else if (text.Contains("تاريخ التسجيل", StringComparison.Ordinal))
            {
                registrationDate = value;
            }
        }

        var tags = SelectNodes(
                document.DocumentNode,
                "//a[contains(@class, 'skill') or contains(@class, 'tag')]")
            .Select(node => CleanText(node.InnerText))
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return ScrapeResult<JobDetails>.Success(
            new JobDetails(
                Description: description,
                HiringRate: hiringRate,
                Status: status,
                Communications: communications,
                Duration: duration,
                Budget: budget,
                RegistrationDate: registrationDate,
                Tags: tags.Length > 0 ? tags : null));
    }

    private static JobListing? TryParseProjectRow(HtmlNode row, HashSet<string> seenIds)
    {
        var titleLink = row.SelectSingleNode(
            ".//h2//a[contains(@href, '/project/') and not(contains(@href, '/project/create'))]");
        var href = GetAttribute(titleLink, "href");
        var match = ProjectIdRegex.Match(href ?? string.Empty);

        if (!match.Success || !seenIds.Add(match.Groups[1].Value))
        {
            return null;
        }

        var timeNode = row.SelectSingleNode(".//time");
        var metaItems = row.SelectNodes(".//ul[contains(@class, 'project__meta')]//li");
        var posterNode = row.SelectSingleNode(
            ".//ul[contains(@class, 'project__meta')]//li[.//i[contains(@class, 'fa-user')]]");

        return new JobListing(
            Id: match.Groups[1].Value,
            PlatformId: Descriptor.Id,
            Title: CleanText(titleLink?.InnerText),
            Budget: "غير محدد",
            Time: CleanText(timeNode?.InnerText),
            Url: AbsoluteUrl(BaseUrl, href),
            Poster: NullIfEmpty(posterNode?.InnerText),
            PostedAt: NullIfEmpty(GetAttribute(timeNode, "datetime") ?? GetAttribute(timeNode, "title")),
            BidsText: metaItems is { Count: >= 3 }
                ? NullIfEmpty(metaItems[2].InnerText)
                : null);
    }

    private static JobListing? TryParseClassicRow(HtmlNode row, HashSet<string> seenIds)
    {
        var titleLink = row.SelectSingleNode(
            ".//a[contains(@href, '/project/') and not(contains(@href, '/project/create'))]");
        var href = GetAttribute(titleLink, "href");
        var match = ProjectIdRegex.Match(href ?? string.Empty);

        if (!match.Success || !seenIds.Add(match.Groups[1].Value))
        {
            return null;
        }

        var budget = CleanText(row.SelectSingleNode(".//td[4]")?.InnerText);
        var timeNode = row.SelectSingleNode(".//td[5] | .//time");

        return new JobListing(
            Id: match.Groups[1].Value,
            PlatformId: Descriptor.Id,
            Title: CleanText(titleLink?.InnerText),
            Budget: string.IsNullOrWhiteSpace(budget) ? "غير محدد" : budget,
            Time: CleanText(timeNode?.InnerText),
            Url: AbsoluteUrl(BaseUrl, href));
    }

    private static JobListing? TryParseFallbackLink(HtmlNode link, HashSet<string> seenIds)
    {
        var href = GetAttribute(link, "href");
        var match = ProjectIdRegex.Match(href ?? string.Empty);
        var title = CleanText(link.InnerText);

        if (!match.Success || title.Length <= 5 || !seenIds.Add(match.Groups[1].Value))
        {
            return null;
        }

        return new JobListing(
            Id: match.Groups[1].Value,
            PlatformId: Descriptor.Id,
            Title: title,
            Budget: "غير محدد",
            Time: string.Empty,
            Url: AbsoluteUrl(BaseUrl, href));
    }
}
