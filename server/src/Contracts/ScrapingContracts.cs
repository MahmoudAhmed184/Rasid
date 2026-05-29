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

public sealed record NewJobsDetectedMessage(
    DateTimeOffset Timestamp,
    IReadOnlyList<JobListing> Jobs)
{
    public int Count => Jobs.Count;

    public IReadOnlyList<string> Platforms =>
        Jobs.Select(job => job.PlatformId)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
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

public interface IScrapeResult<out T>
{
    ScrapeOutcomeKind Outcome { get; }
    T? Value { get; }
    ScrapeError? Error { get; }
    bool IsSuccess { get; }
}

public sealed record ScrapeResult<T>(
    ScrapeOutcomeKind Outcome,
    T? Value = default,
    ScrapeError? Error = null) : IScrapeResult<T>
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
