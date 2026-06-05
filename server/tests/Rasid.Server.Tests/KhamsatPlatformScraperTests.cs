using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using Rasid.Server.Models;
using Rasid.Server.Platforms;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class KhamsatPlatformScraperTests
{
    [Fact]
    public async Task FetchDetailsAsync_UsesSidebarOwnerAndPublishDateBeforeCommentMetadata()
    {
        var html = """
            <!doctype html>
            <html lang="ar" dir="rtl">
                <body>
                    <main>
                        <article class="replace_urls">
                            أحتاج إلى تطوير واجهة عربية مفصلة مع تحسينات تجربة المستخدم وتوثيق واضح لكل حالة.
                            هذا الوصف طويل بما يكفي لاختبار اختيار الوصف الصحيح من صفحة الطلب.
                        </article>
                        <section class="comments">
                            <a class="username" href="/user/commenter">معلق لا يجب اختياره</a>
                            <time datetime="2026-01-01T00:00:00+03:00"></time>
                        </section>
                    </main>
                    <aside id="community_sidebar">
                        <div id="sidebar">
                            <a class="sidebar_user" href="/user/request-owner">صاحب الطلب</a>
                            <div class="meta-row">
                                <span>تاريخ النشر</span>
                                <span title="05/06/2026 08:30 GMT">منذ ساعتين</span>
                            </div>
                            <a href="/user/bidder">مزايد لا يجب اختياره</a>
                        </div>
                    </aside>
                </body>
            </html>
            """;
        var scraper = new KhamsatPlatformScraper(
            new HttpClient(new StubHttpMessageHandler(html)),
            NullLogger<KhamsatPlatformScraper>.Instance);

        var result = await scraper.FetchDetailsAsync(
            new JobListing(
                Id: "9",
                PlatformId: "khamsat",
                Title: "طلب",
                Budget: string.Empty,
                Time: string.Empty,
                Url: "https://khamsat.com/community/requests/9-request"),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal("صاحب الطلب", result.Value.ClientName);
        Assert.Equal("05/06/2026 08:30 GMT", result.Value.PostedAt);
        Assert.Contains("تطوير واجهة عربية", result.Value.Description);
    }

    private sealed class StubHttpMessageHandler(string html) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(html)
            });
    }
}
