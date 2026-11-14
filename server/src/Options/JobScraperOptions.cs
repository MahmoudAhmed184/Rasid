namespace Rasid.Server.Options;

public sealed class JobScraperOptions
{
    public const string SectionName = "JobScraper";

    public int InitialDelaySeconds { get; set; } = 5;

    public int CheckIntervalSeconds { get; set; } = 60;

    public int MaxSeenJobs { get; set; } = 5000;

    public int MaxConcurrentEnrichmentsPerPlatform { get; set; } = 3;

    public int KhamsatPublishFreshnessHours { get; set; } = 48;

    public string DbPath { get; set; } = "seen_jobs.db";

    public int SeenJobRetentionDays { get; set; } = 14;
}
