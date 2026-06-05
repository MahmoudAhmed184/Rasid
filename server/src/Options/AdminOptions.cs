namespace Rasid.Server.Options;

public sealed class AdminOptions
{
    public const string DefaultToken = "change-me-in-production";

    public string Token { get; set; } = DefaultToken;

    public bool UsesDefaultToken =>
        string.Equals(Token, DefaultToken, StringComparison.Ordinal);
}
