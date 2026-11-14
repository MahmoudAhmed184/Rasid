namespace Rasid.Server.Options;

public enum CorsPolicyMode
{
    AllowAll,
    AllowConfiguredOrigins
}

public sealed class BrowserExtensionCorsOptions
{
    public const string SectionName = "Cors";
    public const string PolicyName = "RasidBrowserExtension";

    public CorsPolicyMode Mode { get; set; } = CorsPolicyMode.AllowAll;

    public string[] AllowedOrigins { get; set; } = [];
}
