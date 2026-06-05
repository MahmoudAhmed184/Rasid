using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class AdminBroadcastEndpointTests
{
    private const string AdminToken = "local-test-admin-token";

    [Fact]
    public async Task Broadcast_ReturnsUnauthorized_WhenAdminTokenIsInvalid()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        using var request = CreateBroadcastRequest("wrong-token", new { Message = "hello" });
        var cancellationToken = TestContext.Current.CancellationToken;

        using var response = await client.SendAsync(request, cancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Broadcast_ReturnsBadRequest_WhenMessageIsMissing()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        using var request = CreateBroadcastRequest(AdminToken, new { Message = "   " });
        var cancellationToken = TestContext.Current.CancellationToken;

        using var response = await client.SendAsync(request, cancellationToken);
        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var payload = await JsonDocument.ParseAsync(responseStream, cancellationToken: cancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Message is required.", payload.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Broadcast_ReturnsBadRequest_WhenUrlIsNotAbsoluteHttpOrHttps()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        using var request = CreateBroadcastRequest(AdminToken, new
        {
            Message = "hello",
            Url = "/relative"
        });
        var cancellationToken = TestContext.Current.CancellationToken;

        using var response = await client.SendAsync(request, cancellationToken);
        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var payload = await JsonDocument.ParseAsync(responseStream, cancellationToken: cancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Url must be an absolute http or https URL.", payload.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Broadcast_ReturnsBadRequest_WhenMessageIsTooLong()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        using var request = CreateBroadcastRequest(AdminToken, new
        {
            Message = new string('x', 1001)
        });
        var cancellationToken = TestContext.Current.CancellationToken;

        using var response = await client.SendAsync(request, cancellationToken);
        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var payload = await JsonDocument.ParseAsync(responseStream, cancellationToken: cancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Message must be 1000 characters or fewer.", payload.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Broadcast_ReturnsOk_WhenRequestIsValid()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        using var request = CreateBroadcastRequest(AdminToken, new
        {
            Message = "hello",
            Url = "https://example.com/status"
        });
        var cancellationToken = TestContext.Current.CancellationToken;

        using var response = await client.SendAsync(request, cancellationToken);
        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var payload = await JsonDocument.ParseAsync(responseStream, cancellationToken: cancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(payload.RootElement.GetProperty("success").GetBoolean());
        Assert.True(payload.RootElement.GetProperty("broadcasted").GetBoolean());
    }

    private static RasidServerApplicationFactory CreateFactory() =>
        new(settings: new Dictionary<string, string?>
        {
            ["AdminToken"] = AdminToken
        });

    private static HttpRequestMessage CreateBroadcastRequest(string token, object payload)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/admin/broadcast")
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Add("X-Admin-Token", token);

        return request;
    }
}
