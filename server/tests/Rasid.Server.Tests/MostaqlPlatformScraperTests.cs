using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using Rasid.Server.Models;
using Rasid.Server.Platforms;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class MostaqlPlatformScraperTests
{
    [Fact]
    public async Task FetchListingsAsync_ParsesDivListGroupItemsAndTableRows()
    {
        var html = """
            <!doctype html>
            <html lang="ar" dir="rtl">
                <body>
                    <div class="list-group-item">
                        <a href="/project/123-build-arabic-dashboard">تطوير لوحة متابعة عربية</a>
                        <span><i class="fa-user"></i> صاحب المشروع</span>
                        <time datetime="2026-05-22T08:30:00+03:00">منذ ساعة</time>
                        <ul class="project__meta">
                            <li>برمجة</li>
                            <li>مفتوح</li>
                            <li>12 عروض</li>
                        </ul>
                    </div>
                    <div class="project-row">
                        <h2><a href="/projects/789-plural-url-project">مشروع برابط جمع</a></h2>
                        <time datetime="2026-05-22T09:00:00+03:00">منذ نصف ساعة</time>
                    </div>
                    <div class="list-group-item">
                        <a href="https://evil.example/project/999">رابط خارج المنصة يجب تجاهله</a>
                    </div>
                    <table>
                        <tr>
                            <td><a href="https://mostaql.com/project/456-data-cleanup">تنظيف بيانات</a></td>
                            <td></td>
                            <td></td>
                            <td>$100 - $250</td>
                            <td>منذ يومين</td>
                        </tr>
                    </table>
                </body>
            </html>
            """;

        var scraper = new MostaqlPlatformScraper(
            new HttpClient(new StubHttpMessageHandler(html)),
            NullLogger<MostaqlPlatformScraper>.Instance);

        var result = await scraper.FetchListingsAsync(CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(3, result.Value.Count);

        var firstJob = result.Value[0];
        Assert.Equal("123", firstJob.Id);
        Assert.Equal("mostaql", firstJob.PlatformId);
        Assert.Equal("تطوير لوحة متابعة عربية", firstJob.Title);
        Assert.Equal("https://mostaql.com/project/123-build-arabic-dashboard", firstJob.Url);
        Assert.Equal("12 عروض", firstJob.BidsText);
        Assert.Equal("2026-05-22T08:30:00+03:00", firstJob.PostedAt);
        Assert.NotNull(firstJob.Poster);
        Assert.Contains("صاحب المشروع", firstJob.Poster);

        var secondJob = result.Value[1];
        Assert.Equal("789", secondJob.Id);
        Assert.Equal("مشروع برابط جمع", secondJob.Title);
        Assert.Equal("https://mostaql.com/projects/789-plural-url-project", secondJob.Url);

        var thirdJob = result.Value[2];
        Assert.Equal("456", thirdJob.Id);
        Assert.Equal("$100 - $250", thirdJob.Budget);
    }

    [Fact]
    public async Task FetchDetailsAsync_ParsesArticleBodyAndMetadata()
    {
        var html = """
            <!doctype html>
            <html lang="ar" dir="rtl">
                <body>
                    <span class="label-prj-open">مفتوح</span>
                    <article class="project-post__body">
                        نحتاج إلى بناء إضافة متصفح تدعم اتجاه النص العربي وحقول RTL بدون كسر التخطيط.
                    </article>
                    <div class="profile__name"><bdi>أحمد محمد</bdi></div>
                    <time itemprop="datePublished" datetime="2026-05-22T09:00:00Z"></time>
                    <div class="meta-row">
                        <span>الميزانية</span><span class="meta-value">$500 - $1000</span>
                    </div>
                    <div class="meta-row"><span>مدة التنفيذ</span><span class="meta-value">15 يوم</span></div>
                    <div class="meta-row"><span>معدل التوظيف</span><span class="meta-value">87%</span></div>
                    <div class="meta-row"><span>التواصلات الجارية</span><span class="meta-value">3</span></div>
                    <div class="meta-row">
                        <span>تاريخ التسجيل</span><span class="meta-value">1 يناير 2025</span>
                    </div>
                </body>
            </html>
            """;

        var scraper = new MostaqlPlatformScraper(
            new HttpClient(new StubHttpMessageHandler(html)),
            NullLogger<MostaqlPlatformScraper>.Instance);

        var result = await scraper.FetchDetailsAsync(
            new JobListing(
                Id: "123",
                PlatformId: "mostaql",
                Title: "مشروع",
                Budget: string.Empty,
                Time: string.Empty,
                Url: "https://mostaql.com/project/123"),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal("مفتوح", result.Value.Status);
        Assert.Contains("إضافة متصفح", result.Value.Description);
        Assert.Equal("$500 - $1000", result.Value.Budget);
        Assert.Equal("15 يوم", result.Value.Duration);
        Assert.Equal("87%", result.Value.HiringRate);
        Assert.Equal("3", result.Value.Communications);
        Assert.Equal("أحمد محمد", result.Value.ClientName);
        Assert.Equal("2026-05-22T09:00:00Z", result.Value.PostedAt);
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
