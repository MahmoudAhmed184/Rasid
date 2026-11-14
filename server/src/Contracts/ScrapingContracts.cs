using System.Net;
using Rasid.Server.Models;

namespace Rasid.Server.Contracts;

public sealed record JobPlatformDescriptor(
    string Id,
    string DisplayName,
    string ListingUrl);

public sealed record JobKey(string PlatformId, string JobId)
{
    public static JobKey From(JobListing listing) => new(listing.PlatformId, listing.Id);
}

public sealed record NewJobsDetectedMessage
{
    public DateTimeOffset Timestamp { get; }
    public IReadOnlyList<JobListing> Jobs { get; }
    public int Count => Jobs.Count;
    public IReadOnlyList<string> Platforms { get; }

    public NewJobsDetectedMessage(DateTimeOffset timestamp, IReadOnlyList<JobListing> jobs)
    {
        Timestamp = timestamp;
        Jobs = jobs;

        if (jobs.Count == 0)
        {
            Platforms = [];
        }
        else if (jobs.Count == 1)
        {
            Platforms = [jobs[0].PlatformId];
        }
        else
        {
            var firstPlatform = jobs[0].PlatformId;
            var allSame = true;
            for (var i = 1; i < jobs.Count; i++)
            {
                if (!string.Equals(jobs[i].PlatformId, firstPlatform, StringComparison.Ordinal))
                {
                    allSame = false;
                    break;
                }
            }

            if (allSame)
            {
                Platforms = [firstPlatform];
            }
            else
            {
                var distinct = new HashSet<string>(StringComparer.Ordinal);
                for (var i = 0; i < jobs.Count; i++)
                {
                    distinct.Add(jobs[i].PlatformId);
                }
                Platforms = distinct.ToArray();
            }
        }
    }
}

public enum ScrapeOutcomeKind
{
    Success,
    Skipped,
    ChallengeBlocked,
    NotFound,
    Failed
}

public enum ScrapeErrorKind
{
    Skipped,
    ChallengeBlocked,
    NotFound,
    HttpFailure,
    ParseFailure,
    Unknown
}

public sealed record ScrapeError(
    ScrapeErrorKind Kind,
    string Message,
    string? Url = null,
    HttpStatusCode? StatusCode = null);

public sealed record ScrapeResult<T>(
    ScrapeOutcomeKind Outcome,
    T? Value = default,
    ScrapeError? Error = null)
{
    public bool IsSuccess => Outcome == ScrapeOutcomeKind.Success;

    public ScrapeResult<TNext> WithoutValue<TNext>() => new(Outcome, default, Error);

    public static ScrapeResult<T> Success(T value) => new(ScrapeOutcomeKind.Success, value);

    public static ScrapeResult<T> Skipped(string message) =>
        new(
            ScrapeOutcomeKind.Skipped,
            default,
            new ScrapeError(ScrapeErrorKind.Skipped, message));

    public static ScrapeResult<T> ChallengeBlocked(
        string url,
        string message = "Upstream anti-bot challenge blocked scraping.") =>
        new(
            ScrapeOutcomeKind.ChallengeBlocked,
            default,
            new ScrapeError(ScrapeErrorKind.ChallengeBlocked, message, url));

    public static ScrapeResult<T> NotFound(
        string url,
        string message = "Upstream resource was not found.") =>
        new(
            ScrapeOutcomeKind.NotFound,
            default,
            new ScrapeError(ScrapeErrorKind.NotFound, message, url, HttpStatusCode.NotFound));

    public static ScrapeResult<T> Failed(
        string message,
        string? url = null,
        HttpStatusCode? statusCode = null,
        ScrapeErrorKind kind = ScrapeErrorKind.HttpFailure) =>
        new(
            ScrapeOutcomeKind.Failed,
            default,
            new ScrapeError(kind, message, url, statusCode));
}
