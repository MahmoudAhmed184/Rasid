# Frelancia Optional SignalR Backend

This folder contains the ASP.NET Core backend used for realtime job notifications. The project builds and runs as `Rasid.Server`.

## What It Does

The backend:

- polls supported marketplace listing pages
- enriches newly discovered jobs where detail pages are accessible
- deduplicates items in memory by `platform:id`
- broadcasts batches to connected clients through SignalR
- broadcasts admin messages to connected clients through SignalR

Registered server-side scrapers:

- `mostaql`
- `khamsat`
- `nafezly`

Endpoints:

- `GET /health`
- `GET /api/providers`
- `POST /api/admin/broadcast`
- `GET /broadcast-tool`
- SignalR hub at `/jobNotificationHub`

## Toolchain

The backend targets .NET 10 and is pinned by the repository root [../global.json](../global.json):

- SDK: `10.0.300`
- Runtime: `10.0.8`

On CachyOS/Arch-style systems, install the current .NET 10 SDK package and remove the old .NET 8 packages:

```bash
sudo pacman -Syu dotnet-sdk-bin
sudo pacman -Rns dotnet-sdk-8.0 aspnet-runtime-8.0 dotnet-runtime-8.0 dotnet-targeting-pack-8.0
```

Keep `dotnet-host`; it is required by the installed runtimes.

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
- `http://localhost:5000/broadcast-tool`
- `http://localhost:5000/api/admin/broadcast`
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
},
"AdminToken": "change-me-in-production"
```

`Cors:Mode=AllowAll` is intended for local extension development. In `Production`, startup fails when credentials are enabled with `AllowAll`; use `AllowConfiguredOrigins` and list the exact extension/backend origins in `Cors:AllowedOrigins`.

`AdminToken` protects `POST /api/admin/broadcast`. In `Production`, startup fails when the token is missing or still set to `change-me-in-production`.

## Validation

From the repository root:

```bash
dotnet restore server/src/Rasid.Server.sln
dotnet list server/src/Rasid.Server.sln package --outdated
dotnet list server/src/Rasid.Server.sln package --vulnerable --include-transitive
dotnet restore server/src/Rasid.Server.sln --locked-mode
dotnet build server/src/Rasid.Server.sln -c Release --no-restore
dotnet test server/src/Rasid.Server.sln -c Release --no-build
dotnet publish server/src/Rasid.Server.csproj -c Release --no-restore -o /tmp/rasid-server-publish
```

## Important Integration Notes

- The packaged extension manifest whitelists `https://rasid.runasp.net/*` as the backend origin and current extension settings do not persist another SignalR URL.
- Admin broadcasts require the `X-Admin-Token` header and a JSON body with `Message` plus optional `Url`. The current endpoint rejects invalid tokens, blank messages, messages longer than 1000 characters, and non-absolute HTTP(S) URLs, then broadcasts `AdminMessageReceived` with `id`, `message`, `createdAt`, and `url`.
- Token comparison uses SHA-256 hashes and fixed-time comparison. The broadcast endpoint is rate limited to five accepted requests per minute.
- `/broadcast-tool` is a local HTML helper for manually posting to `/api/admin/broadcast`; it includes the example token value in the form for convenience and must not be treated as a secure admin console without deployment hardening.

## Main Files

- [`src/Program.cs`](src/Program.cs): application bootstrap, CORS, endpoints, and SignalR hub registration
- [`src/Models/AdminMessageRequest.cs`](src/Models/AdminMessageRequest.cs): admin broadcast request body
- [`src/Options/AdminOptions.cs`](src/Options/AdminOptions.cs): admin token option defaults
- [`src/Options/OptionsValidation.cs`](src/Options/OptionsValidation.cs): startup validators for scraper, CORS, and admin options
- [`src/Services/AdminTokenComparer.cs`](src/Services/AdminTokenComparer.cs): fixed-time admin token comparison helper
- [`src/Services/KhamsatFreshnessPolicy.cs`](src/Services/KhamsatFreshnessPolicy.cs): Khamsat publish-date freshness classification
- [`src/Services/JobPollingWorker.cs`](src/Services/JobPollingWorker.cs): hosted polling scheduler
- [`src/Services/ScrapeCycleRunner.cs`](src/Services/ScrapeCycleRunner.cs): listing fetch, deduplication, enrichment, and broadcast orchestration
- [`src/Services/InMemorySeenJobCache.cs`](src/Services/InMemorySeenJobCache.cs): in-memory seen-job cache
- [`src/Services/SignalRJobBroadcaster.cs`](src/Services/SignalRJobBroadcaster.cs): SignalR broadcaster
- [`src/Platforms/`](src/Platforms): per-platform scraper implementations
- [`tests/Rasid.Server.Tests`](tests/Rasid.Server.Tests): .NET tests for endpoints, admin broadcasts, startup validation, Khamsat freshness, and scraping behavior

## Further Reading

- [docs/backend-reference.md](docs/backend-reference.md)

## License

This backend is licensed under the [MIT License](LICENSE).
