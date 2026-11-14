using System.Net;
using Microsoft.Extensions.Logging;
using Microsoft.Playwright;

namespace Rasid.Server.Crawler;

public sealed class PlaywrightHeadlessBrowserService(ILogger<PlaywrightHeadlessBrowserService> logger) : IHeadlessBrowserService
{
    public async Task<string?> FetchHtmlAsync(
        string url,
        CookieContainer cookieContainer,
        CancellationToken cancellationToken)
    {
        try
        {
            using var playwright = await Playwright.CreateAsync();
            await using var browser = await playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
            {
                Headless = true,
                Args = ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"]
            });

            await using var context = await browser.NewContextAsync(new BrowserNewContextOptions
            {
                UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                Locale = "ar",
                BypassCSP = true
            });

            // Block images, fonts, stylesheets, media to lower memory consumption
            await context.RouteAsync("**/*", async route =>
            {
                var resourceType = route.Request.ResourceType;
                if (resourceType is "image" or "font" or "stylesheet" or "media")
                {
                    await route.AbortAsync();
                }
                else
                {
                    await route.ContinueAsync();
                }
            });

            var page = await context.NewPageAsync();
            logger.LogInformation("Navigating to {Url} via Playwright headless browser fallback...", url);

            var response = await page.GotoAsync(url, new PageGotoOptions
            {
                WaitUntil = WaitUntilState.DOMContentLoaded,
                Timeout = 30000
            });

            // Wait briefly for potential Turnstile / Cloudflare challenges to settle
            try
            {
                await page.WaitForTimeoutAsync(2000);
            }
            catch (Exception)
            {
                // ignore timeout cancellation
            }

            var html = await page.ContentAsync();

            // Share solved session cookies from Playwright to the HTTP client container for subsequent requests
            var cookies = await context.CookiesAsync();
            var uri = new Uri(url);
            foreach (var cookie in cookies)
            {
                try
                {
                    var domain = string.IsNullOrWhiteSpace(cookie.Domain)
                        ? uri.Host
                        : cookie.Domain.TrimStart('.');
                    var cookieUri = new Uri($"{uri.Scheme}://{domain}{cookie.Path}");
                    var c = new System.Net.Cookie(cookie.Name, cookie.Value, cookie.Path, domain);
                    cookieContainer.Add(cookieUri, c);
                }
                catch (Exception ex)
                {
                    logger.LogDebug(ex, "Failed to copy cookie {CookieName} to container.", cookie.Name);
                }
            }

            logger.LogInformation("Successfully retrieved HTML via Playwright fallback for {Url}. Solved {CookieCount} cookie(s).", url, cookies.Count);
            return html;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Playwright headless browser fallback failed for {Url}.", url);
            return null;
        }
    }
}
