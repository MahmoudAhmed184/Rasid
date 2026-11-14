using Microsoft.Extensions.Hosting;
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

        if (string.IsNullOrWhiteSpace(options.DbPath))
        {
            failures.Add("JobScraper:DbPath must not be empty.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}

public sealed class CrawlerOptionsValidator : IValidateOptions<CrawlerOptions>
{
    public ValidateOptionsResult Validate(string? name, CrawlerOptions options)
    {
        var failures = new List<string>();

        if (options.PerDomainDelayMilliseconds < 0)
        {
            failures.Add("Crawler:PerDomainDelayMilliseconds must be greater than or equal to 0.");
        }

        if (options.RequestTimeoutSeconds < 1)
        {
            failures.Add("Crawler:RequestTimeoutSeconds must be greater than or equal to 1.");
        }

        if (options.MaxRetries < 0)
        {
            failures.Add("Crawler:MaxRetries must be greater than or equal to 0.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}

public sealed class BrowserExtensionCorsOptionsValidator(IHostEnvironment environment)
    : IValidateOptions<BrowserExtensionCorsOptions>
{
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

        if (environment.IsProduction() && options.Mode == CorsPolicyMode.AllowAll)
        {
            failures.Add("Production CORS cannot use AllowAll because credentials are enabled.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}

public sealed class AdminOptionsValidator(IHostEnvironment environment)
    : IValidateOptions<AdminOptions>
{
    public ValidateOptionsResult Validate(string? name, AdminOptions options)
    {
        var failures = new List<string>();

        if (string.IsNullOrWhiteSpace(options.Token))
        {
            if (environment.IsProduction())
            {
                failures.Add("Production AdminToken must be set to a non-default secret.");
            }
            else
            {
                failures.Add("AdminToken must not be empty.");
            }
        }
        else if (environment.IsProduction() && options.UsesDefaultToken)
        {
            failures.Add("Production AdminToken must be set to a non-default secret.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}
