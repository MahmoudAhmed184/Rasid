using HtmlAgilityPack;
using System.Text.RegularExpressions;
using Rasid.Server.Contracts;
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

        foreach (var row in SelectNodes(
                     documentResult.Value.DocumentNode,
                     "//div[contains(@class, 'list-group-item')] | //div[contains(@class, 'project-row')] | //tr[contains(@class, 'project-row')] | //li[contains(@class, 'project-row')]"))
        {
            var job = TryParseProjectRow(row, seenIds);
            if (job is not null)
            {
                jobs.Add(job);
            }
        }

        foreach (var row in SelectNodes(
                     documentResult.Value.DocumentNode,
                     "//tr[.//a[contains(@href, '/project/') or contains(@href, '/projects/')]]"))
        {
            var job = TryParseClassicRow(row, seenIds);
            if (job is not null)
            {
                jobs.Add(job);
            }
        }

        if (jobs.Count == 0)
        {
            foreach (var link in SelectNodes(
                         documentResult.Value.DocumentNode,
                         "//a[(contains(@href, '/project/') or contains(@href, '/projects/')) and not(contains(@href, 'create'))]"))
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
            .SelectSingleNode("//span[contains(@class, 'label-prj')] | //*[contains(@class, 'label-prj')]")
            ?.InnerText);
        var description = NullIfEmpty(document.DocumentNode
            .SelectSingleNode("//*[contains(@class, 'project-post__body')]")
            ?.InnerText);

        string? communications = null;
        string? hiringRate = null;
        string? duration = null;
        string? budget = null;
        string? registrationDate = null;

        var metaNodes = SelectNodes(
            document.DocumentNode,
            "//tr[contains(@class, 'meta-row')] | " +
            "//table[contains(@class, 'table-meta')]//tr | " +
            "//*[contains(@class, 'meta-row')] | " +
            "//*[contains(@class, 'meta-item')] | " +
            "//li[contains(@class, 'meta-item')] | " +
            "//div[contains(@class, 'meta-item')] | " +
            "//table[contains(@class, 'table')]//tr"
        );

        foreach (var row in metaNodes)
        {
            var text = CleanText(row.InnerText);
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            var valueNode = row.SelectSingleNode(
                ".//*[contains(@class, 'meta-value') or contains(@class, 'meta-item-value')] | " +
                ".//td[contains(@class, 'meta-value')] | " +
                ".//td[last()]"
            );

            string? value = null;
            if (valueNode != null)
            {
                value = NullIfEmpty(valueNode.InnerText);
            }
            else
            {
                var children = row.SelectNodes("./*");
                if (children != null && children.Count >= 2)
                {
                    value = NullIfEmpty(children[1].InnerText);
                }
                else
                {
                    var parts = text.Split(new[] { ':', '：' }, 2);
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

        var clientNode = document.DocumentNode.SelectSingleNode(
            "//*[contains(@class, 'profile__name')]//bdi | " +
            "//*[contains(@class, 'profile__name')]//a | " +
            "//a[contains(@href, '/u/') and not(.//img)]");
        var clientName = NullIfEmpty(clientNode?.InnerText);

        var timeNode = document.DocumentNode.SelectSingleNode(
            "//time[@itemprop='datePublished'] | " +
            "//*[@id='project-meta-panel']//time | " +
            "//time");
        var postedAt = NullIfEmpty(GetAttribute(timeNode, "datetime") ?? GetAttribute(timeNode, "title"));

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

    private static JobListing? TryParseProjectRow(HtmlNode row, HashSet<string> seenIds)
    {
        var titleLink = row.SelectSingleNode(
            ".//h2//a[(contains(@href, '/project/') or contains(@href, '/projects/')) and not(contains(@href, 'create'))]")
            ?? row.SelectSingleNode(
                ".//a[(contains(@href, '/project/') or contains(@href, '/projects/')) and not(contains(@href, 'create'))]");
        var href = GetAttribute(titleLink, "href");
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

        var timeNode = row.SelectSingleNode(".//time");
        var metaItems = row.SelectNodes(".//ul[contains(@class, 'project__meta')]//li | .//*[contains(@class, 'project__meta')]//li");
        var posterNode = row.SelectSingleNode(
            ".//ul[contains(@class, 'project__meta')]//li[.//i[contains(@class, 'fa-user')]] | " +
            ".//*[.//i[contains(@class, 'fa-user')]] | " +
            ".//a[contains(@href, '/u/') and not(.//img)]");
        var budgetNode = row.SelectSingleNode(".//*[contains(@class, 'budget')] | .//td[4]");
        var budget = CleanText(budgetNode?.InnerText);

        return new JobListing(
            Id: match.Groups[1].Value,
            PlatformId: Descriptor.Id,
            Title: CleanText(titleLink?.InnerText),
            Budget: string.IsNullOrWhiteSpace(budget) ? "غير محدد" : budget,
            Time: CleanText(timeNode?.InnerText),
            Url: resolvedUrl,
            Poster: NullIfEmpty(posterNode?.InnerText),
            PostedAt: NullIfEmpty(GetAttribute(timeNode, "datetime") ?? GetAttribute(timeNode, "title")),
            BidsText: metaItems is { Count: >= 3 }
                ? NullIfEmpty(metaItems[2].InnerText)
                : null);
    }

    private static JobListing? TryParseClassicRow(HtmlNode row, HashSet<string> seenIds)
    {
        var titleLink = row.SelectSingleNode(
            ".//a[(contains(@href, '/project/') or contains(@href, '/projects/')) and not(contains(@href, 'create'))]");
        var href = GetAttribute(titleLink, "href");
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

        var budget = CleanText(row.SelectSingleNode(".//td[4]")?.InnerText);
        var timeNode = row.SelectSingleNode(".//td[5] | .//time");

        return new JobListing(
            Id: match.Groups[1].Value,
            PlatformId: Descriptor.Id,
            Title: CleanText(titleLink?.InnerText),
            Budget: string.IsNullOrWhiteSpace(budget) ? "غير محدد" : budget,
            Time: CleanText(timeNode?.InnerText),
            Url: resolvedUrl);
    }

    private static JobListing? TryParseFallbackLink(HtmlNode link, HashSet<string> seenIds)
    {
        var href = GetAttribute(link, "href");
        var resolvedUrl = ResolveMostaqlProjectUrl(href);
        if (resolvedUrl is null)
        {
            return null;
        }

        var match = ProjectIdRegex.Match(resolvedUrl);
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
            Url: resolvedUrl);
    }
}
