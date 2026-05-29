namespace Rasid.Server.Options;

public enum CorsPolicyMode
{
    AllowAll,
    AllowConfiguredOrigins
}

public sealed class BrowserExtensionCorsOptions
{
    public const string SectionName = "Cors";
    public const string PolicyName = "ExtensionClients";

    public CorsPolicyMode Mode { get; init; } = CorsPolicyMode.AllowAll;
    public string[] AllowedOrigins { get; init; } = [];
}
