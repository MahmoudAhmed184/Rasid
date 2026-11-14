using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using Rasid.Server.Models;
using Rasid.Server.Platforms;
using Xunit;

namespace Rasid.Server.Tests;

public sealed class NafezlyPlatformScraperTests
{
    [Fact]
    public async Task FetchListingsAsync_ParsesProjectBoxesCorrectly()
    {
        var html = """
            <!doctype html>
            <html lang="ar" dir="rtl">
                <body>
                    <div class="project-box">
                        <a class="text-truncate" href="https://nafezly.com/project/101-mobile-app">تطبيق جوال تفاعلي</a>
                        <a href="/u/client101">محمد سالم</a>
                        <h3 class="naskh">تفاصيل موجزة لمشروع الجوال</h3>
                        <span><span class="fa-usd-circle"></span> $150 - $300</span>
                        <span><span class="fa-business-time"></span> 10 أيام</span>
                        <span><span class="fa-ballot"></span> 4 عروض</span>
                        <span><span class="fa-clock"></span> منذ 3 ساعات</span>
                    </div>
                    <div class="project-box">
                        <a class="text-truncate" href="/project/102-landing-page">صفحة هبوط تسويقية</a>
                        <a href="/u/client102">خالد أحمد</a>
                        <h3 class="naskh">تصميم واجهة مستخدم حديثة</h3>
                        <span><span class="fa-usd-circle"></span> $50 - $100</span>
                        <span><span class="fa-business-time"></span> 3 أيام</span>
                        <span><span class="fa-ballot"></span> عرضان</span>
                        <span><span class="fa-clock"></span> منذ 30 دقيقة</span>
                    </div>
                    <div class="project-box">
                        <a class="text-truncate" href="/project/create">إنشاء مشروع - يجب تجاهله</a>
                    </div>
                </body>
            </html>
            """;

        var scraper = new NafezlyPlatformScraper(
            new HttpClient(new StubHttpMessageHandler(html)),
            NullLogger<NafezlyPlatformScraper>.Instance);

        var result = await scraper.FetchListingsAsync(CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(2, result.Value.Count);

        var first = result.Value[0];
        Assert.Equal("101", first.Id);
        Assert.Equal("nafezly", first.PlatformId);
        Assert.Equal("تطبيق جوال تفاعلي", first.Title);
        Assert.Equal("$150 - $300", first.Budget);
        Assert.Equal("محمد سالم", first.Poster);
        Assert.Equal("10 أيام", first.Duration);
        Assert.Equal("4 عروض", first.BidsText);
        Assert.Equal("تفاصيل موجزة لمشروع الجوال", first.Description);

        var second = result.Value[1];
        Assert.Equal("102", second.Id);
        Assert.Equal("صفحة هبوط تسويقية", second.Title);
        Assert.Equal("$50 - $100", second.Budget);
        Assert.Equal("خالد أحمد", second.Poster);
    }

    [Fact]
    public async Task FetchDetailsAsync_ParsesProjectMetaBoxesAndDetails()
    {
        var html = """
            <!doctype html>
            <html lang="ar" dir="rtl">
                <body>
                    <div class="main-nafez-box-styles">
                        <div>تفاصيل المشروع</div>
                        <h2>نحتاج إلى مبرمج فلاتر محترف لتطوير شاشات التطبيق وربط الـ API بالكامل.</h2>
                    </div>
                    <div class="main-nafez-box-styles">
                        <div>بطاقة المشروع</div>
                        <div class="row" style="padding:4px 5px">
                            <div>حالة المشروع</div>
                            <div>مفتوح لتلقي العروض</div>
                        </div>
                        <div class="row" style="padding:4px 5px">
                            <div>تاريخ النشر</div>
                            <div>2026-06-10T14:00:00Z</div>
                        </div>
                        <div class="row" style="padding:4px 5px">
                            <div>المدة المتاحة</div>
                            <div>15 يوماً</div>
                        </div>
                        <div class="row" style="padding:4px 5px">
                            <div>الميزانية</div>
                            <div>$200 - $400</div>
                        </div>
                        <div class="row" style="padding:4px 5px">
                            <div>عدد المتقدمين</div>
                            <div>7 عروض</div>
                        </div>
                    </div>
                    <div class="main-nafez-box-styles">
                        <span>صاحب المشروع</span>
                        <a href="/u/superclient">نور الهدى</a>
                    </div>
                    <div class="tags">
                        <a class="tag-class" href="/projects/skill/flutter">Flutter</a>
                        <a class="tag-class" href="/projects/skill/dart">Dart</a>
                    </div>
                </body>
            </html>
            """;

        var scraper = new NafezlyPlatformScraper(
            new HttpClient(new StubHttpMessageHandler(html)),
            NullLogger<NafezlyPlatformScraper>.Instance);

        var listing = new JobListing(
            Id: "101",
            PlatformId: "nafezly",
            Title: "تطبيق جوال",
            Budget: "$150 - $300",
            Time: "منذ ساعتين",
            Url: "https://nafezly.com/project/101-mobile-app");

        var result = await scraper.FetchDetailsAsync(listing, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Contains("مبرمج فلاتر محترف", result.Value.Description);
        Assert.Equal("مفتوح لتلقي العروض", result.Value.Status);
        Assert.Equal("2026-06-10T14:00:00Z", result.Value.PostedAt);
        Assert.Equal("15 يوماً", result.Value.Duration);
        Assert.Equal("$200 - $400", result.Value.Budget);
        Assert.Equal("7 عروض", result.Value.BidsText);
        Assert.Equal("نور الهدى", result.Value.ClientName);
        Assert.NotNull(result.Value.Tags);
        Assert.Equal(["Flutter", "Dart"], result.Value.Tags);
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
