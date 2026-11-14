using System.Text.RegularExpressions;
using AngleSharp.Dom;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Rasid.Server.Contracts;
using Rasid.Server.Crawler;
using Rasid.Server.Models;

namespace Rasid.Server.Platforms;

public sealed class MostaqlPlatformScraper : JobPlatformScraperBase
{
    private const string BaseUrl = "https://mostaql.com";
    private static readonly Regex ProjectIdRegex = new(@"/projects?/(\d+)", RegexOptions.Compiled);
    private static readonly JobPlatformDescriptor Descriptor = new(
        "mostaql",
        "Mostaql",
        "https://mostaql.com/projects?sort=latest");

    public MostaqlPlatformScraper(
        ICrawlerEngine crawlerEngine,
        ILogger<MostaqlPlatformScraper> logger,
        TimeProvider? timeProvider = null)
        : base(crawlerEngine, logger, timeProvider)
    {
    }

    // Overload for testing
    internal MostaqlPlatformScraper(
        HttpClient httpClient,
        ILogger<MostaqlPlatformScraper> logger,
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

        foreach (var row in doc.QuerySelectorAll("div.list-group-item, div.project-row, tr.project-row, li.project-row"))
        {
            var job = TryParseProjectRow(row, seenIds);
            if (job is not null)
            {
                jobs.Add(job);
            }
        }

        foreach (var row in doc.QuerySelectorAll("tr"))
        {
            if (row.QuerySelector("a[href*='/project/'], a[href*='/projects/']") is null)
            {
                continue;
            }

            var job = TryParseClassicRow(row, seenIds);
            if (job is not null)
            {
                jobs.Add(job);
            }
        }

        if (jobs.Count == 0)
        {
            foreach (var link in doc.QuerySelectorAll("a[href*='/project/']:not([href*='create']), a[href*='/projects/']:not([href*='create'])"))
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

        var doc = documentResult.Value;
        var status = NullIfEmpty(doc.QuerySelector(".label-prj-open, .label-prj, span.label-prj")?.TextContent);
        var description = NullIfEmpty(doc.QuerySelector(".project-post__body, .carda__content, .text-wrapper-div")?.TextContent);

        string? communications = null;
        string? hiringRate = null;
        string? duration = null;
        string? budget = null;
        string? registrationDate = null;

        var metaNodes = doc.QuerySelectorAll("tr.meta-row, table.table-meta tr, .meta-row, .meta-item, li.meta-item, div.meta-item, table.table tr");

        foreach (var row in metaNodes)
        {
            var text = CleanText(row.TextContent);
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            var valueNode = row.QuerySelector(".meta-value, .meta-item-value, td.meta-value, td:last-child");

            string? value = null;
            if (valueNode != null)
            {
                value = NullIfEmpty(valueNode.TextContent);
            }
            else
            {
                var children = row.Children;
                if (children.Length >= 2)
                {
                    value = NullIfEmpty(children[1].TextContent);
                }
                else
                {
                    var parts = text.Split([':', '：'], 2);
                    if (parts.Length == 2)
                    {
                        value = NullIfEmpty(parts[1]);
                    }
                }
            }

            if (value is null)
            {
                continue;
            }

            if (text.Contains("التواصلات الجارية", StringComparison.Ordinal) || text.Contains("Communications", StringComparison.OrdinalIgnoreCase))
            {
                communications = value;
            }
            else if (text.Contains("معدل التوظيف", StringComparison.Ordinal) || text.Contains("Hiring", StringComparison.OrdinalIgnoreCase))
            {
                hiringRate = value;
            }
            else if (text.Contains("مدة التنفيذ", StringComparison.Ordinal) || text.Contains("Duration", StringComparison.OrdinalIgnoreCase))
            {
                duration = value;
            }
            else if (text.Contains("الميزانية", StringComparison.Ordinal) || text.Contains("Budget", StringComparison.OrdinalIgnoreCase))
            {
                budget = value;
            }
            else if (text.Contains("تاريخ التسجيل", StringComparison.Ordinal) || text.Contains("Joined", StringComparison.OrdinalIgnoreCase))
            {
                registrationDate = value;
            }
        }

        var clientNode = doc.QuerySelector(".profile__name bdi, .profile__name a") ??
                         doc.QuerySelectorAll("a[href*='/u/']").FirstOrDefault(static a => a.QuerySelector("img") is null);
        var clientName = NullIfEmpty(clientNode?.TextContent);

        var timeNode = doc.QuerySelector("time[itemprop='datePublished'], #project-meta-panel time, time");
        var postedAt = NullIfEmpty(timeNode?.GetAttribute("datetime") ?? timeNode?.GetAttribute("title"));

        var tags = doc.QuerySelectorAll("a.skill, a.tag, .tags .tag, .skills .tag")
            .Select(static node => CleanText(node.TextContent))
            .Where(static tag => !string.IsNullOrWhiteSpace(tag))
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
                ClientName: clientName,
                PostedAt: postedAt,
                Tags: tags.Length > 0 ? tags : null));
    }

    internal static string? ResolveMostaqlProjectUrl(string? href)
    {
        if (string.IsNullOrWhiteSpace(href))
        {
            return null;
        }

        Uri uri;
        if (Uri.TryCreate(href, UriKind.Absolute, out var absoluteUri) &&
            (absoluteUri.Scheme == Uri.UriSchemeHttp || absoluteUri.Scheme == Uri.UriSchemeHttps))
        {
            uri = absoluteUri;
        }
        else
        {
            try
            {
                uri = new Uri(new Uri(BaseUrl), href);
            }
            catch
            {
                return null;
            }
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return null;
        }

        var host = uri.Host.ToLowerInvariant();
        if (host != "mostaql.com" && !host.EndsWith(".mostaql.com", StringComparison.Ordinal))
        {
            return null;
        }

        return uri.ToString();
    }

    private static JobListing? TryParseProjectRow(IElement row, HashSet<string> seenIds)
    {
        var titleLink = row.QuerySelector("h2 a[href*='/project/']:not([href*='create']), h2 a[href*='/projects/']:not([href*='create'])")
            ?? row.QuerySelector("a[href*='/project/']:not([href*='create']), a[href*='/projects/']:not([href*='create'])");
        var href = titleLink?.GetAttribute("href");
        var resolvedUrl = ResolveMostaqlProjectUrl(href);
        if (resolvedUrl is null)
        {
            return null;
        }

        var match = ProjectIdRegex.Match(resolvedUrl);
        if (!match.Success || !seenIds.Add(match.Groups[1].Value))
        {
            return null;
        }

        var timeNode = row.QuerySelector("time");
        var metaItems = row.QuerySelectorAll("ul.project__meta li, .project__meta li");
        var posterNode = row.QuerySelector("ul.project__meta li:has(.fa-user), li:has(.fa-user)") ??
                         row.QuerySelectorAll("a[href*='/u/']").FirstOrDefault(static a => a.QuerySelector("img") is null) ??
                         row.QuerySelector(".fa-user")?.ParentElement;

        var budgetNode = row.QuerySelector(".budget, td:nth-child(4)");
        var budget = CleanText(budgetNode?.TextContent);

        return new JobListing(
            Id: match.Groups[1].Value,
            PlatformId: Descriptor.Id,
            Title: CleanText(titleLink?.TextContent),
            Budget: string.IsNullOrWhiteSpace(budget) ? "غير محدد" : budget,
            Time: CleanText(timeNode?.TextContent),
            Url: resolvedUrl,
            Poster: NullIfEmpty(posterNode?.TextContent),
            PostedAt: NullIfEmpty(timeNode?.GetAttribute("datetime") ?? timeNode?.GetAttribute("title")),
            BidsText: metaItems.Length >= 3 ? NullIfEmpty(metaItems[2].TextContent) : null);
    }

    private static JobListing? TryParseClassicRow(IElement row, HashSet<string> seenIds)
    {
        var titleLink = row.QuerySelector("a[href*='/project/']:not([href*='create']), a[href*='/projects/']:not([href*='create'])");
        var href = titleLink?.GetAttribute("href");
        var resolvedUrl = ResolveMostaqlProjectUrl(href);
        if (resolvedUrl is null)
        {
            return null;
        }

        var match = ProjectIdRegex.Match(resolvedUrl);
        if (!match.Success || !seenIds.Add(match.Groups[1].Value))
        {
            return null;
        }

        var cells = row.QuerySelectorAll("td");
        var budget = cells.Length >= 4 ? CleanText(cells[3].TextContent) : string.Empty;
        var timeNode = cells.Length >= 5 ? cells[4] : row.QuerySelector("time");

        return new JobListing(
            Id: match.Groups[1].Value,
            PlatformId: Descriptor.Id,
            Title: CleanText(titleLink?.TextContent),
            Budget: string.IsNullOrWhiteSpace(budget) ? "غير محدد" : budget,
            Time: CleanText(timeNode?.TextContent),
            Url: resolvedUrl);
    }

    private static JobListing? TryParseFallbackLink(IElement link, HashSet<string> seenIds)
    {
        var href = link.GetAttribute("href");
        var resolvedUrl = ResolveMostaqlProjectUrl(href);
        if (resolvedUrl is null)
        {
            return null;
        }

        var match = ProjectIdRegex.Match(resolvedUrl);
        var title = CleanText(link.TextContent);

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
            Url: resolvedUrl);
    }
}
