namespace Rasid.Server.Options;

public sealed class CrawlerOptions
{
    public const string SectionName = "Crawler";

    public bool EnableHeadlessFallback { get; set; } = true;

    public int PerDomainDelayMilliseconds { get; set; } = 1000;

    public int JitterMaxMilliseconds { get; set; } = 500;

    public int RequestTimeoutSeconds { get; set; } = 20;

    public int MaxRetries { get; set; } = 3;
}
