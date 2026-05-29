using Rasid.Server.Contracts;

namespace Rasid.Server.Models;

public sealed record JobListing(
    string Id,
    string PlatformId,
    string Title,
    string Budget,
    string Time,
    string Url,
    string? Poster = null,
    string? PostedAt = null,
    string? LastInteractionAt = null,
    string? BidsText = null,
    string? Description = null,
    string? HiringRate = null,
    string? Status = null,
    string? Communications = null,
    string? Duration = null,
    string? RegistrationDate = null,
    string? ClientName = null,
    string? ClientType = null,
    IReadOnlyList<string>? Tags = null)
{
    public JobKey Key => JobKey.From(this);

    public JobListing Apply(JobDetails details) => this with
    {
        Poster = details.Poster ?? details.ClientName ?? Poster,
        PostedAt = details.PostedAt ?? PostedAt,
        BidsText = details.BidsText ?? BidsText,
        Description = details.Description ?? Description,
        HiringRate = details.HiringRate ?? HiringRate,
        Status = details.Status ?? Status,
        Communications = details.Communications ?? Communications,
        Duration = details.Duration ?? Duration,
        RegistrationDate = details.RegistrationDate ?? RegistrationDate,
        ClientName = details.ClientName ?? ClientName,
        ClientType = details.ClientType ?? ClientType,
        Budget = string.IsNullOrWhiteSpace(Budget) || Budget == "غير محدد"
            ? details.Budget ?? Budget
            : Budget,
        Tags = details.Tags is { Count: > 0 } ? details.Tags : Tags
    };
}
