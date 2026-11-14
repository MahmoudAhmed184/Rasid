using System.Net;

namespace Rasid.Server.Crawler;

public interface IHeadlessBrowserService
{
    Task<string?> FetchHtmlAsync(string url, CookieContainer cookieContainer, CancellationToken cancellationToken);
}
