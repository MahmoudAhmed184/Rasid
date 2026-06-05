# Rasid Optional SignalR Backend

This folder contains the ASP.NET Core backend used for realtime job notifications. The project builds and runs as `Rasid.Server`.

## What It Does

The backend:

- polls supported marketplace listing pages
- enriches newly discovered jobs where detail pages are accessible
- deduplicates items in memory by `platform:id`
- broadcasts batches to connected clients through SignalR

Registered server-side scrapers:

- `mostaql`
- `khamsat`
- `nafezly`

Endpoints:

- `GET /health`
- `GET /api/providers`
- SignalR hub at `/jobNotificationHub`

## Run Locally

From `server/src/`:

```bash
dotnet restore
dotnet build
dotnet run --project Rasid.Server.csproj
```

Default local URLs:

- `http://localhost:5000/health`
- `http://localhost:5000/api/providers`
- `http://localhost:5000/jobNotificationHub`

## Configuration

Local configuration file: `src/appsettings.json`.

The repository keeps [src/appsettings.example.json](src/appsettings.example.json) as a safe template. Copy it to `src/appsettings.json` for local overrides when needed. The local config file is ignored by git.

Relevant sections:

```json
"Urls": "http://localhost:5000;https://localhost:5001",
"JobScraper": {
  "InitialDelaySeconds": 5,
  "CheckIntervalSeconds": 60,
  "MaxSeenJobs": 500,
  "MaxConcurrentEnrichmentsPerPlatform": 4,
  "KhamsatPublishFreshnessHours": 48
},
"Cors": {
  "Mode": "AllowAll",
  "AllowedOrigins": []
}
```

## Important Integration Notes

- The extension manifest currently whitelists only `https://rasid.runasp.net/*` as a backend origin. If you want the extension to talk to another backend host, update `hostPermissions` in the repo-root `wxt.config.ts` and rebuild the extension.

## Main Files

- [`src/Program.cs`](src/Program.cs): application bootstrap, CORS, endpoints, and SignalR hub registration
- [`src/Services/JobPollingWorker.cs`](src/Services/JobPollingWorker.cs): hosted polling scheduler
- [`src/Services/ScrapeCycleRunner.cs`](src/Services/ScrapeCycleRunner.cs): listing fetch, deduplication, enrichment, and broadcast orchestration
- [`src/Services/InMemorySeenJobCache.cs`](src/Services/InMemorySeenJobCache.cs): in-memory seen-job cache
- [`src/Services/SignalRJobBroadcaster.cs`](src/Services/SignalRJobBroadcaster.cs): SignalR broadcaster
- [`src/Platforms/`](src/Platforms): per-platform scraper implementations

## Further Reading

- [docs/backend-reference.md](docs/backend-reference.md)

## License

This backend is licensed under the [MIT License](LICENSE).
