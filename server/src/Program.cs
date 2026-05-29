using Rasid.Server.Extensions;
using Rasid.Server.Hubs;
using Rasid.Server.Options;
using Rasid.Server.Platforms;
using Rasid.Server.Services;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);
var corsSettings = builder.Configuration
    .GetSection(BrowserExtensionCorsOptions.SectionName)
    .Get<BrowserExtensionCorsOptions>() ?? new BrowserExtensionCorsOptions();

builder.Services.Configure<JobScraperOptions>(
    builder.Configuration.GetSection(JobScraperOptions.SectionName));
builder.Services.Configure<BrowserExtensionCorsOptions>(
    builder.Configuration.GetSection(BrowserExtensionCorsOptions.SectionName));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();

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

app.MapHub<JobNotificationHub>("/jobNotificationHub");

app.Run();
