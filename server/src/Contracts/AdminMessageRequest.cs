namespace Rasid.Server.Contracts;

public sealed class AdminMessageRequest
{
    public string Message { get; set; } = string.Empty;
    public string? Url { get; set; }
}
