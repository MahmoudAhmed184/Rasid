namespace Rasid.Server.Models;

public class AdminMessageRequest
{
    public string Message { get; set; } = string.Empty;
    public string? Url { get; set; }
}
