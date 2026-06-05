using Microsoft.Extensions.Options;

namespace Rasid.Server.Options;

public sealed class JobScraperOptionsValidator : IValidateOptions<JobScraperOptions>
{
    public ValidateOptionsResult Validate(string? name, JobScraperOptions options)
    {
        var failures = new List<string>();

        if (options.InitialDelaySeconds < 0)
        {
            failures.Add("JobScraper:InitialDelaySeconds must be greater than or equal to 0.");
        }

        if (options.CheckIntervalSeconds < 1)
        {
            failures.Add("JobScraper:CheckIntervalSeconds must be greater than or equal to 1.");
        }

        if (options.MaxSeenJobs < 1)
        {
            failures.Add("JobScraper:MaxSeenJobs must be greater than or equal to 1.");
        }

        if (options.MaxConcurrentEnrichmentsPerPlatform < 1)
        {
            failures.Add("JobScraper:MaxConcurrentEnrichmentsPerPlatform must be greater than or equal to 1.");
        }

        if (options.KhamsatPublishFreshnessHours < 1)
        {
            failures.Add("JobScraper:KhamsatPublishFreshnessHours must be greater than or equal to 1.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}

public sealed class BrowserExtensionCorsOptionsValidator : IValidateOptions<BrowserExtensionCorsOptions>
{
    private readonly IHostEnvironment _environment;

    public BrowserExtensionCorsOptionsValidator(IHostEnvironment environment)
    {
        _environment = environment;
    }

    public ValidateOptionsResult Validate(string? name, BrowserExtensionCorsOptions options)
    {
        var failures = new List<string>();

        if (!Enum.IsDefined(options.Mode))
        {
            failures.Add("Cors:Mode must be AllowAll or AllowConfiguredOrigins.");
        }

        if (options.AllowedOrigins.Any(string.IsNullOrWhiteSpace))
        {
            failures.Add("Cors:AllowedOrigins cannot contain empty origins.");
        }

        if (options.Mode == CorsPolicyMode.AllowConfiguredOrigins && options.AllowedOrigins.Length == 0)
        {
            failures.Add("Cors:AllowedOrigins must contain at least one origin when Cors:Mode is AllowConfiguredOrigins.");
        }

        if (_environment.IsProduction() && options.Mode == CorsPolicyMode.AllowAll)
        {
            failures.Add("Production CORS cannot use AllowAll because credentials are enabled.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}

public sealed class AdminOptionsValidator : IValidateOptions<AdminOptions>
{
    private readonly IHostEnvironment _environment;

    public AdminOptionsValidator(IHostEnvironment environment)
    {
        _environment = environment;
    }

    public ValidateOptionsResult Validate(string? name, AdminOptions options)
    {
        var failures = new List<string>();

        if (string.IsNullOrWhiteSpace(options.Token))
        {
            failures.Add("AdminToken must not be empty.");
        }

        if (_environment.IsProduction() && options.UsesDefaultToken)
        {
            failures.Add("Production AdminToken must be set to a non-default secret.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}
