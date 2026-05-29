namespace Rasid.Server.Models;

public sealed record JobDetails(
    string? Description = null,
    string? HiringRate = null,
    string? Status = null,
    string? Communications = null,
    string? Duration = null,
    string? Budget = null,
    string? RegistrationDate = null,
    string? ClientName = null,
    string? ClientType = null,
    string? Poster = null,
    string? PostedAt = null,
    string? BidsText = null,
    IReadOnlyList<string>? Tags = null);
