using System.Net;
using AngleSharp.Dom;
using Rasid.Server.Contracts;

namespace Rasid.Server.Crawler;

public interface ICrawlerEngine
{
    Task<ScrapeResult<IDocument>> GetDocumentAsync(
        string url,
        string platformId,
        CancellationToken cancellationToken);

    CookieContainer CookieContainer { get; }
}
