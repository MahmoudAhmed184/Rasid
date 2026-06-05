namespace Rasid.Server.Options;

public sealed class JobScraperOptions
{
    public const string SectionName = "JobScraper";

    public int InitialDelaySeconds { get; set; } = 5;
    public int CheckIntervalSeconds { get; set; } = 60;
    public int MaxSeenJobs { get; set; } = 500;
    public int MaxConcurrentEnrichmentsPerPlatform { get; set; } = 4;
    public int KhamsatPublishFreshnessHours { get; set; } = 48;
}
