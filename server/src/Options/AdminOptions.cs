namespace Rasid.Server.Options;

public sealed class AdminOptions
{
    public const string SectionName = "Admin";

    public string Token { get; set; } = string.Empty;

    public bool UsesDefaultToken =>
        string.Equals(Token, "change-me-in-production", StringComparison.OrdinalIgnoreCase);
}
