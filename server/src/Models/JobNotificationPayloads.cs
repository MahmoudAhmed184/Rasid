using System.Text.Json.Serialization;
using Rasid.Server.Models;

namespace Rasid.Server.Models;

public sealed record ConnectedPayload(
    [property: JsonPropertyName("connectionId")] string ConnectionId,
    [property: JsonPropertyName("timestamp")] DateTime Timestamp,
    [property: JsonPropertyName("message")] string Message);

public sealed record AdminMessagePayload(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("createdAt")] DateTime CreatedAt,
    [property: JsonPropertyName("url")] string? Url = null);

public sealed record JobListingPayload(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("platformId")] string PlatformId,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("budget")] string Budget,
    [property: JsonPropertyName("time")] string Time,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("poster")] string? Poster = null,
    [property: JsonPropertyName("postedAt")] string? PostedAt = null,
    [property: JsonPropertyName("lastInteractionAt")] string? LastInteractionAt = null,
    [property: JsonPropertyName("bidsText")] string? BidsText = null,
    [property: JsonPropertyName("description")] string? Description = null,
    [property: JsonPropertyName("hiringRate")] string? HiringRate = null,
    [property: JsonPropertyName("status")] string? Status = null,
    [property: JsonPropertyName("communications")] string? Communications = null,
    [property: JsonPropertyName("duration")] string? Duration = null,
    [property: JsonPropertyName("registrationDate")] string? RegistrationDate = null,
    [property: JsonPropertyName("clientName")] string? ClientName = null,
    [property: JsonPropertyName("clientType")] string? ClientType = null,
    [property: JsonPropertyName("tags")] IReadOnlyList<string>? Tags = null)
{
    public static JobListingPayload From(JobListing job) => new(
        Id: job.Id,
        PlatformId: job.PlatformId,
        Title: job.Title,
        Budget: job.Budget,
        Time: job.Time,
        Url: job.Url,
        Poster: job.Poster,
        PostedAt: job.PostedAt,
        LastInteractionAt: job.LastInteractionAt,
        BidsText: job.BidsText,
        Description: job.Description,
        HiringRate: job.HiringRate,
        Status: job.Status,
        Communications: job.Communications,
        Duration: job.Duration,
        RegistrationDate: job.RegistrationDate,
        ClientName: job.ClientName,
        ClientType: job.ClientType,
        Tags: job.Tags);
}

public sealed record NewJobsDetectedPayload(
    [property: JsonPropertyName("timestamp")] DateTime Timestamp,
    [property: JsonPropertyName("count")] int Count,
    [property: JsonPropertyName("platforms")] IReadOnlyList<string> Platforms,
    [property: JsonPropertyName("jobs")] IReadOnlyList<JobListingPayload> Jobs);
