using Rasid.Server.Extensions;
using Rasid.Server.Hubs;
using Rasid.Server.Models;
using Rasid.Server.Options;
using Rasid.Server.Platforms;
using Rasid.Server.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.SignalR;
using System.Threading.RateLimiting;

const string AdminBroadcastRateLimitPolicy = "AdminBroadcast";
const int MaxAdminBroadcastMessageLength = 1000;

var builder = WebApplication.CreateBuilder(args);
var corsSettings = builder.Configuration
    .GetSection(BrowserExtensionCorsOptions.SectionName)
    .Get<BrowserExtensionCorsOptions>() ?? new BrowserExtensionCorsOptions();

builder.Services
    .AddOptions<JobScraperOptions>()
    .Bind(builder.Configuration.GetSection(JobScraperOptions.SectionName))
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<JobScraperOptions>, JobScraperOptionsValidator>();

builder.Services
    .AddOptions<BrowserExtensionCorsOptions>()
    .Bind(builder.Configuration.GetSection(BrowserExtensionCorsOptions.SectionName))
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<BrowserExtensionCorsOptions>, BrowserExtensionCorsOptionsValidator>();

builder.Services
    .AddOptions<AdminOptions>()
    .Configure<IConfiguration>((options, configuration) =>
    {
        options.Token = configuration["AdminToken"] ?? AdminOptions.DefaultToken;
    })
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<AdminOptions>, AdminOptionsValidator>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter(AdminBroadcastRateLimitPolicy, limiterOptions =>
    {
        limiterOptions.PermitLimit = 5;
        limiterOptions.Window = TimeSpan.FromMinutes(1);
        limiterOptions.QueueLimit = 0;
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
});

builder.Services.AddCors(options =>
{
    options.AddPolicy(BrowserExtensionCorsOptions.PolicyName, policy =>
    {
        switch (corsSettings.Mode)
        {
            case CorsPolicyMode.AllowConfiguredOrigins when corsSettings.AllowedOrigins.Length > 0:
                policy.WithOrigins(corsSettings.AllowedOrigins);
                break;
            case CorsPolicyMode.AllowConfiguredOrigins:
                policy.SetIsOriginAllowed(_ => false);
                break;
            default:
                policy.SetIsOriginAllowed(_ => true);
                break;
        }

        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddSingleton<ISeenJobCache, InMemorySeenJobCache>();
builder.Services.AddSingleton<IJobBroadcaster, SignalRJobBroadcaster>();
builder.Services.AddSingleton<IScrapeCycleRunner, ScrapeCycleRunner>();
builder.Services.AddHostedService<JobPollingWorker>();
builder.Services.AddPlatformScraper<MostaqlPlatformScraper>();
builder.Services.AddPlatformScraper<KhamsatPlatformScraper>();
builder.Services.AddPlatformScraper<NafezlyPlatformScraper>();

var app = builder.Build();
var configuredCors = app.Services.GetRequiredService<IOptions<BrowserExtensionCorsOptions>>().Value;

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (configuredCors.Mode == CorsPolicyMode.AllowAll)
{
    app.Logger.LogWarning("CORS policy is configured in AllowAll mode. Restrict origins before production hardening.");
}
else if (configuredCors.AllowedOrigins.Length == 0)
{
    app.Logger.LogWarning("CORS policy is configured for explicit origins, but no allowed origins were supplied.");
}

app.UseCors(BrowserExtensionCorsOptions.PolicyName);
app.UseRateLimiter();

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    serverTimeUtc = DateTime.UtcNow,
    hubPath = "/jobNotificationHub"
}));

app.MapGet("/api/providers", (IEnumerable<IJobPlatformScraper> scrapers) =>
    Results.Ok(scrapers.Select(scraper => new
    {
        id = scraper.Platform.Id,
        name = scraper.Platform.DisplayName,
        listingUrl = scraper.Platform.ListingUrl
    })));
app.MapGet("/broadcast-tool", () => Results.Content(@"
<!DOCTYPE html>
<html lang=""ar"" dir=""rtl"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>لوحة التحكم بالبث - Frelancia</title>
    <link href=""https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap"" rel=""stylesheet"">
    <style>
        :root {
            --bg: #0b0f19;
            --card: #151d30;
            --primary: #2386c8;
            --primary-hover: #1c6da0;
            --text: #f1f5f9;
            --text-muted: #94a3b8;
            --success: #10b981;
            --error: #ef4444;
            --border: #1e293b;
        }

        body {
            background-color: var(--bg);
            color: var(--text);
            font-family: 'Cairo', system-ui, sans-serif;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }

        .container {
            background-color: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 32px;
            width: 450px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
            animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        h1 {
            font-size: 24px;
            font-weight: 800;
            margin-top: 0;
            margin-bottom: 24px;
            text-align: center;
            background: linear-gradient(135deg, #38bdf8 0%, #2386c8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .form-group {
            margin-bottom: 18px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        label {
            font-size: 13px;
            font-weight: 700;
            color: var(--text-muted);
        }

        input, textarea {
            background-color: #0b0f19;
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
            font-family: inherit;
            font-size: 14px;
            padding: 12px;
            outline: none;
            transition: border-color 0.2s;
        }

        input:focus, textarea:focus {
            border-color: var(--primary);
        }

        textarea {
            resize: vertical;
            min-height: 80px;
        }

        button {
            background-color: var(--primary);
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            font-family: inherit;
            font-size: 15px;
            font-weight: 700;
            padding: 14px;
            width: 100%;
            transition: background-color 0.2s;
            margin-top: 8px;
        }

        button:hover {
            background-color: var(--primary-hover);
        }

        .status {
            margin-top: 16px;
            padding: 12px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
            text-align: center;
            display: none;
        }

        .status.success {
            display: block;
            background-color: rgba(16, 185, 129, 0.1);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .status.error {
            display: block;
            background-color: rgba(239, 68, 68, 0.1);
            color: var(--error);
            border: 1px solid rgba(239, 68, 68, 0.2);
        }
    </style>
</head>
<body>
    <div class=""container"">
        <h1>لوحة بث الإشعارات الإدارية 📢</h1>
        <form id=""broadcastForm"">
            <div class=""form-group"">
                <label for=""token"">رمز المسؤول (Admin Token)</label>
                <input type=""text"" id=""token"" value=""change-me-in-production"" required>
            </div>
            <div class=""form-group"">
                <label for=""message"">نص الرسالة</label>
                <textarea id=""message"" placeholder=""مثال: سيتم تحديث النظام خلال 10 دقائق..."" required></textarea>
            </div>
            <div class=""form-group"">
                <label for=""url"">الرابط الإضافي (اختياري)</label>
                <input type=""url"" id=""url"" placeholder=""https://mostaql.com"">
            </div>
            <button type=""submit"" id=""submitBtn"">بث الرسالة الآن</button>
        </form>
        <div id=""status"" class=""status""></div>
    </div>

    <script>
        document.getElementById('broadcastForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = document.getElementById('token').value;
            const message = document.getElementById('message').value;
            const url = document.getElementById('url').value || null;
            const submitBtn = document.getElementById('submitBtn');
            const statusDiv = document.getElementById('status');

            submitBtn.disabled = true;
            submitBtn.textContent = 'جاري البث...';
            statusDiv.className = 'status';
            statusDiv.style.display = 'none';

            try {
                const response = await fetch('/api/admin/broadcast', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-Token': token
                    },
                    body: JSON.stringify({ Message: message, Url: url })
                });

                if (response.ok) {
                    statusDiv.textContent = '✓ تم بث الرسالة بنجاح لجميع المستخدمين!';
                    statusDiv.className = 'status success';
                    document.getElementById('message').value = '';
                    document.getElementById('url').value = '';
                } else {
                    const data = await response.json().catch(() => ({}));
                    statusDiv.textContent = `✗ فشل الإرسال: ${data.error || 'رمز المسؤول غير صالح أو مدخلات خاطئة.'}`;
                    statusDiv.className = 'status error';
                }
            } catch (err) {
                statusDiv.textContent = '✗ حدث خطأ أثناء الاتصال بالخادم.';
                statusDiv.className = 'status error';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'بث الرسالة الآن';
            }
        });
    </script>
</body>
</html>
", "text/html; charset=utf-8"));

app.MapPost("/api/admin/broadcast", async (
    [FromHeader(Name = "X-Admin-Token")] string? token,
    [FromBody] AdminMessageRequest? request,
    IOptions<AdminOptions> adminOptions,
    IHubContext<JobNotificationHub> hubContext) =>
{
    if (!AdminTokenComparer.Matches(token, adminOptions.Value.Token))
    {
        return Results.Unauthorized();
    }

    if (request is null || string.IsNullOrWhiteSpace(request.Message))
    {
        return Results.BadRequest(new { error = "Message is required." });
    }

    var message = request.Message.Trim();
    if (message.Length > MaxAdminBroadcastMessageLength)
    {
        return Results.BadRequest(new { error = $"Message must be {MaxAdminBroadcastMessageLength} characters or fewer." });
    }

    string? url = null;
    if (!string.IsNullOrWhiteSpace(request.Url))
    {
        if (!Uri.TryCreate(request.Url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return Results.BadRequest(new { error = "Url must be an absolute http or https URL." });
        }

        url = uri.ToString();
    }

    await hubContext.Clients.All.SendAsync("AdminMessageReceived", new
    {
        id = Guid.NewGuid().ToString(),
        message,
        createdAt = DateTime.UtcNow,
        url
    });

    return Results.Ok(new { success = true, broadcasted = true });
}).RequireRateLimiting(AdminBroadcastRateLimitPolicy);

app.MapHub<JobNotificationHub>("/jobNotificationHub");

app.Run();

public partial class Program;
