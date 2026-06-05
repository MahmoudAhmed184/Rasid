using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class EndpointSmokeTests
{
    [Fact]
    public async Task Health_ReturnsOkShape()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var cancellationToken = TestContext.Current.CancellationToken;

        using var response = await client.GetAsync("/health", cancellationToken);
        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var payload = await JsonDocument.ParseAsync(responseStream, cancellationToken: cancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ok", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("/jobNotificationHub", payload.RootElement.GetProperty("hubPath").GetString());
        Assert.True(payload.RootElement.TryGetProperty("serverTimeUtc", out _));
    }

    [Fact]
    public async Task Providers_ReturnRegisteredScrapers()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var cancellationToken = TestContext.Current.CancellationToken;

        var providers = await client.GetFromJsonAsync<JsonElement[]>("/api/providers", cancellationToken);

        Assert.NotNull(providers);
        Assert.Contains(providers, provider => provider.GetProperty("id").GetString() == "mostaql");
        Assert.Contains(providers, provider => provider.GetProperty("id").GetString() == "khamsat");
        Assert.Contains(providers, provider => provider.GetProperty("id").GetString() == "nafezly");
    }

    private static RasidServerApplicationFactory CreateFactory() =>
        new(settings: new Dictionary<string, string?>
        {
            ["AdminToken"] = "local-test-admin-token"
        });
}
