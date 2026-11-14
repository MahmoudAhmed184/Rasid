using System.Net;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using System.Threading.RateLimiting;
using Rasid.Server.Crawler;
using Rasid.Server.Endpoints;
using Rasid.Server.Hubs;
using Rasid.Server.Options;
using Rasid.Server.Platforms;
using Rasid.Server.Storage;
using Rasid.Server.Workers;

var builder = WebApplication.CreateBuilder(args);

// Register TimeProvider
builder.Services.AddSingleton(TimeProvider.System);

var corsSettings = builder.Configuration
    .GetSection(BrowserExtensionCorsOptions.SectionName)
    .Get<BrowserExtensionCorsOptions>() ?? new BrowserExtensionCorsOptions();

var crawlerSettings = builder.Configuration
    .GetSection(CrawlerOptions.SectionName)
    .Get<CrawlerOptions>() ?? new CrawlerOptions();

// Options and Validators
builder.Services
    .AddOptions<JobScraperOptions>()
    .Bind(builder.Configuration.GetSection(JobScraperOptions.SectionName))
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<JobScraperOptions>, JobScraperOptionsValidator>();

builder.Services
    .AddOptions<CrawlerOptions>()
    .Bind(builder.Configuration.GetSection(CrawlerOptions.SectionName))
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<CrawlerOptions>, CrawlerOptionsValidator>();

builder.Services
    .AddOptions<BrowserExtensionCorsOptions>()
    .Bind(builder.Configuration.GetSection(BrowserExtensionCorsOptions.SectionName))
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<BrowserExtensionCorsOptions>, BrowserExtensionCorsOptionsValidator>();

builder.Services
    .AddOptions<AdminOptions>()
    .Configure<IConfiguration>((options, configuration) =>
    {
        // Audit: Require secure configuration value without hardcoded fallback
        options.Token = configuration["AdminToken"] ?? string.Empty;
    })
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<AdminOptions>, AdminOptionsValidator>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// SignalR Pipeline with buffer limits and timeouts
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
    options.MaximumReceiveMessageSize = 128 * 1024; // 128 KB
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.HandshakeTimeout = TimeSpan.FromSeconds(15);
});

// Rate Limiter
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter(AdminBroadcastEndpoints.RateLimitPolicy, limiterOptions =>
    {
        limiterOptions.PermitLimit = 5;
        limiterOptions.Window = TimeSpan.FromMinutes(1);
        limiterOptions.QueueLimit = 0;
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
});

// CORS
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
                policy.SetIsOriginAllowed(static _ => false);
                break;
            default:
                policy.SetIsOriginAllowed(static _ => true);
                break;
        }

        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Shared Cookie Container and Resilient HttpClient with Polly
builder.Services.AddSingleton<CookieContainer>();
builder.Services.AddHttpClient("RasidCrawler")
    .ConfigurePrimaryHttpMessageHandler(static sp => new HttpClientHandler
    {
        CookieContainer = sp.GetRequiredService<CookieContainer>(),
        UseCookies = true,
        AutomaticDecompression = DecompressionMethods.All
    })
    .AddStandardResilienceHandler(options =>
    {
        var timeoutSeconds = Math.Max(1, crawlerSettings.RequestTimeoutSeconds);
        var maxRetries = Math.Max(0, crawlerSettings.MaxRetries);
        options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
        options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(Math.Max(30, timeoutSeconds * 2));
        options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(timeoutSeconds * (maxRetries + 1) + 15);
        options.Retry.MaxRetryAttempts = maxRetries;
        options.Retry.BackoffType = Polly.DelayBackoffType.Exponential;
        options.Retry.UseJitter = true;
    });

// Crawler engine and headless fallback
builder.Services.AddSingleton<PerDomainRateLimiter>();
builder.Services.AddSingleton<IHeadlessBrowserService, PlaywrightHeadlessBrowserService>();
builder.Services.AddSingleton<ICrawlerEngine, CrawlerEngine>();

// Persistent SQLite Storage
builder.Services.AddSingleton<ISeenJobCache, SqliteSeenJobCache>();

// SignalR Broadcasting
builder.Services.AddSingleton<IJobBroadcaster, SignalRJobBroadcaster>();

// Decoupled Channel & Background Workers
builder.Services.AddSingleton<JobChannel>();
builder.Services.AddSingleton<IScrapeCycleRunner, ScrapeCycleRunner>();
builder.Services.AddHostedService<JobBroadcastingWorker>();
builder.Services.AddHostedService<JobPollingWorker>();

// Platform Scrapers
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

// Map Minimal APIs
app.MapRasidEndpoints();

// Map SignalR Hub
app.MapHub<JobNotificationHub>("/jobNotificationHub");

app.Run();

public partial class Program;
