using Microsoft.Extensions.Hosting;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class StartupValidationTests
{
    [Fact]
    public void ProductionStartup_Fails_WhenCorsAllowsAllWithCredentials()
    {
        using var factory = new RasidServerApplicationFactory(
            Environments.Production,
            new Dictionary<string, string?>
            {
                ["AdminToken"] = "production-test-admin-token"
            });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("Production CORS cannot use AllowAll because credentials are enabled.", exception.ToString());
    }

    [Fact]
    public void ProductionStartup_Fails_WhenAdminTokenUsesDefaultValue()
    {
        using var factory = new RasidServerApplicationFactory(
            Environments.Production,
            new Dictionary<string, string?>
            {
                ["Cors:Mode"] = "AllowConfiguredOrigins",
                ["Cors:AllowedOrigins:0"] = "https://example.com"
            });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("Production AdminToken must be set to a non-default secret.", exception.ToString());
    }

    [Fact]
    public void Startup_Fails_WhenScraperRangesAreInvalid()
    {
        using var factory = new RasidServerApplicationFactory(
            settings: new Dictionary<string, string?>
            {
                ["AdminToken"] = "local-test-admin-token",
                ["JobScraper:CheckIntervalSeconds"] = "0"
            });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("JobScraper:CheckIntervalSeconds must be greater than or equal to 1.", exception.ToString());
    }
}
