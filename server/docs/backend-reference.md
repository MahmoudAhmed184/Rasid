# Backend Reference

## Overview

This backend is the real-time monitoring server used by the Frelancia extension. It does four things:

1. polls supported marketplace listing pages on a schedule
2. enriches newly detected items when a detail page can be fetched
3. broadcasts job batches to connected extension clients over SignalR
4. broadcasts admin messages to connected extension clients over SignalR

The project now builds and runs as `Rasid.Server`, and the runtime supports:

- `mostaql`
- `khamsat`
- `nafezly`

The backend targets .NET 10. The repository root `global.json` pins SDK `10.0.300` with `latestFeature` roll-forward disabled for previews.

## Runtime Components

### `src/Program.cs`

Bootstraps the app and registers:

- SignalR
- explicit CORS policy options for extension clients
- the polling worker
- the scrape cycle runner
- the in-memory seen-job cache
- the SignalR broadcaster
- the per-platform scrapers
- Swagger in development
- minimal endpoints:
    - `GET /health`
    - `GET /api/providers`
    - `POST /api/admin/broadcast`
    - `GET /broadcast-tool`

### `src/Services/JobPollingWorker.cs`

This is the hosted scheduler. It does not scrape HTML itself.

Responsibilities:

- waits for the configured startup delay
- runs a polling cycle every `JobScraper:CheckIntervalSeconds`
- delegates each cycle to `IScrapeCycleRunner`

### `src/Services/ScrapeCycleRunner.cs`

This is the per-cycle orchestrator.

Responsibilities:

- asks each registered platform scraper for the latest jobs
- uses `ISeenJobCache` to deduplicate by `platform:id`
- treats the first successful non-empty cycle as a baseline
- enriches only newly detected jobs
- uses bounded parallelism for enrichment per platform
- broadcasts `NewJobsDetected` through `IJobBroadcaster`

### `src/Services/InMemorySeenJobCache.cs`

Default in-memory implementation of the deduplication store.

Responsibilities:

- remembers seen `platform:id` keys
- evicts oldest entries when `JobScraper:MaxSeenJobs` is exceeded
- keeps the orchestration layer storage-agnostic for future replacement

### `src/Services/SignalRJobBroadcaster.cs`

SignalR adapter that preserves the browser extension wire contract while keeping the orchestrator transport-agnostic.

Important behavior:

- the first successful scrape is used as a baseline only
- existing listings found during that initial baseline are not broadcast
- this avoids replaying the whole first page as “new” on every server restart

### `src/Platforms/*.cs`

Each platform scraper owns its own selectors, URLs, and enrichment logic.

### `src/Platforms/JobPlatformScraperBase.cs`

Provides shared HTTP behavior for all scrapers:

- browser-like request headers
- cache-busting helpers for listing fetches
- absolute URL resolution
- upstream anti-bot challenge detection before HTML parsing
- typed `ScrapeResult<T>` outcomes instead of `null` for expected failures like challenge-blocked or not-found responses

#### `MostaqlPlatformScraper.cs`

- polls `https://mostaql.com/projects?sort=latest`
- parses current project rows and older fallback layouts
- enriches jobs from project detail pages
- fills fields such as:
    - `description`
    - `status`
    - `communications`
    - `hiringRate`
    - `duration`
    - `registrationDate`
    - `tags`

#### `KhamsatPlatformScraper.cs`

- polls `https://khamsat.com/community/requests`
- parses community request rows
- attempts detail-page enrichment, but this is best-effort

Current limitation:

- Khamsat detail pages may return `202 Accepted` with `x-amzn-waf-action: challenge`
- when that happens, the backend still emits the listing item, but enrichment is skipped

This means Khamsat SignalR payloads are currently reliable for listing-level fields like:

- `id`
- `platformId`
- `title`
- `url`
- `poster`
- `time`
- `postedAt`

But full detail fields may be missing depending on the upstream anti-bot response.

#### `NafezlyPlatformScraper.cs`

- polls `https://nafezly.com/projects`
- parses project cards from the public listing page
- enriches jobs from the public project detail page
- fills fields such as:
    - `description`
    - `status`
    - `budget`
    - `duration`
    - `bidsText`
    - `clientName`
    - `tags`

### `src/Hubs/JobNotificationHub.cs`

SignalR hub used by the extension.

Hub path:

- `/jobNotificationHub`

Methods/events:

- server -> client: `Connected`
- server -> client: `NewJobsDetected`
- server -> client: `AdminMessageReceived`
- client -> server: `Ping`
- server -> client: `Pong`

### `src/Models/JobListing.cs`

Shared payload model for outbound notifications.

`JobListing` is now an immutable record. Detail enrichment returns a separate `JobDetails` record and the listing is merged with `Apply(...)` rather than being mutated in place.

Important properties:

- `id`
- `platformId`
- `title`
- `url`
- `budget`
- `time`
- `poster`
- `postedAt`
- `bidsText`
- `description`
- `status`
- `communications`
- `duration`
- `registrationDate`
- `clientName`
- `clientType`
- `tags`

### `src/Models/AdminMessageRequest.cs`

Request body for `POST /api/admin/broadcast`.

Properties:

- `Message`
- `Url`

### `src/Options/AdminOptions.cs`

Admin broadcast token options.

Important members:

- `DefaultToken = "change-me-in-production"`
- `Token`
- `UsesDefaultToken`

### `src/Options/OptionsValidation.cs`

Startup validators for:

- `JobScraperOptions`
- `BrowserExtensionCorsOptions`
- `AdminOptions`

Production startup rejects permissive CORS with credentials and rejects the default admin token.

### `src/Services/AdminTokenComparer.cs`

Compares supplied and expected admin tokens by hashing both with SHA-256 and using `CryptographicOperations.FixedTimeEquals()`.

## Polling Lifecycle

One polling cycle looks like this:

1. `JobPollingWorker` triggers `ScrapeCycleRunner`.
2. `ScrapeCycleRunner` asks each `IJobPlatformScraper` for listing items.
3. `ISeenJobCache` deduplicates items by `platformId:id`.
4. On the very first successful non-empty cycle, the items are only cached as baseline.
5. On later cycles, unseen items are treated as new.
6. Each new item is sent back to its platform scraper for optional detail enrichment.
7. The merged batch is sent through `IJobBroadcaster` as `NewJobsDetected`.

## SignalR Contract

### Connected

Sent to the caller immediately after the hub connection succeeds.

Example shape:

```json
{
    "connectionId": "abc123",
    "timestamp": "2026-04-08T12:00:00Z",
    "message": "Successfully connected to Job Notification Hub"
}
```

The `platforms` array may include `mostaql`, `khamsat`, and `nafezly`.

### NewJobsDetected

Broadcast to all connected clients whenever a polling cycle finds new items.

Example shape:

```json
{
    "timestamp": "2026-04-08T12:00:00Z",
    "count": 2,
    "platforms": ["mostaql", "khamsat"],
    "jobs": [
        {
            "id": "1228078",
            "platformId": "mostaql",
            "title": "تصميم خطة بيع لمشروع عقاري استثماري",
            "url": "https://mostaql.com/project/1228078-...",
            "time": "منذ 17 دقيقة",
            "postedAt": "2026-04-08 11:49:56",
            "poster": "Bagadeem B.",
            "bidsText": "عرض واحد",
            "budget": "غير محدد"
        },
        {
            "id": "785281",
            "platformId": "khamsat",
            "title": "موظف/ة اولاين خدمات إلكترونية وطلابية",
            "url": "https://khamsat.com/community/requests/785281-...",
            "time": "منذ يوم وساعتين",
            "postedAt": "07/04/2026 10:06:25 GMT",
            "poster": ".Lahn L"
        }
    ]
}
```

### AdminMessageReceived

Broadcast to all connected clients after an authorized admin broadcast request.

Example shape:

```json
{
    "id": "9ab7b912-8c0f-4c46-8f7b-cf36c5ed61bd",
    "message": "سيتم تحديث النظام خلال 10 دقائق.",
    "createdAt": "2026-04-08T12:00:00Z",
    "url": "https://mostaql.com"
}
```

The browser extension validates `id`, non-empty `message`, and `createdAt`, stores valid payloads under `adminMessages`, shows an admin notification, and renders unread messages in the popup.

## HTTP Endpoints

### `GET /health`

Simple server health probe.

Response shape:

```json
{
    "status": "ok",
    "serverTimeUtc": "2026-04-08T12:00:00Z",
    "hubPath": "/jobNotificationHub"
}
```

### `GET /api/providers`

Returns the registered platform scrapers.

Example:

```json
[
    {
        "id": "mostaql",
        "name": "Mostaql",
        "listingUrl": "https://mostaql.com/projects?sort=latest"
    },
    {
        "id": "khamsat",
        "name": "Khamsat",
        "listingUrl": "https://khamsat.com/community/requests"
    },
    {
        "id": "nafezly",
        "name": "Nafezly",
        "listingUrl": "https://nafezly.com/projects"
    }
]
```

### `POST /api/admin/broadcast`

Administrative SignalR broadcast endpoint.

Headers:

- `X-Admin-Token`

Request shape:

```json
{
    "Message": "Maintenance starts in 10 minutes.",
    "Url": "https://mostaql.com"
}
```

Successful response shape is unchanged:

```json
{
    "success": true,
    "broadcasted": true
}
```

Behavior:

- invalid or missing tokens return `401`
- blank messages return `400`
- messages longer than 1000 characters return `400`
- `Url`, when present, must be an absolute `http` or `https` URL
- token comparison uses fixed-time hash comparison
- the endpoint is rate limited to five accepted requests per minute
- successful requests emit `AdminMessageReceived` with generated `id`, `message`, UTC `createdAt`, and optional `url`

The browser extension still validates notification click URLs before opening them.

### `GET /broadcast-tool`

Development helper page for manually sending admin broadcasts. It is kept for the current backend workflow and uses the same `POST /api/admin/broadcast` endpoint.

The form includes the example token value from source for local convenience. Replace the token and harden access before exposing this route.

## Configuration

Local configuration lives in `src/appsettings.json`.

The repository includes `src/appsettings.example.json` as the safe template. Copy it to `src/appsettings.json` for local overrides. The local config file is ignored by git.

### `Urls`

Listening addresses for local development.

### `JobScraper`

- `InitialDelaySeconds`
  delay before the first scrape after startup
- `CheckIntervalSeconds`
  delay between polling cycles
- `MaxSeenJobs`
  max number of cached `platform:id` keys kept in memory
- `MaxConcurrentEnrichmentsPerPlatform`
  max parallel detail-page enrichments per platform
- `KhamsatPublishFreshnessHours`
  publish-date freshness window used to suppress stale Khamsat requests after detail hydration

### `Cors`

- `Mode`
  `AllowAll` for local development, or `AllowConfiguredOrigins` for explicit origin checks
- `AllowedOrigins`
  exact allowed origins used when `Mode` is `AllowConfiguredOrigins`

In `Production`, startup fails when `Mode` is `AllowAll` because credentials are enabled. Production deployments must use explicit origins.

### `AdminToken`

Shared secret required by `POST /api/admin/broadcast`.

In `Production`, startup fails when `AdminToken` is missing, empty, or set to `change-me-in-production`.

## Local Development

### SDK Setup

Install .NET SDK `10.0.300`. On CachyOS/Arch-style systems:

```bash
sudo pacman -Syu dotnet-sdk-bin
sudo pacman -Rns dotnet-sdk-8.0 aspnet-runtime-8.0 dotnet-runtime-8.0 dotnet-targeting-pack-8.0
```

Keep `dotnet-host`; it is required by .NET runtimes.

From `src/`:

```bash
dotnet restore
dotnet build
dotnet run
```

Useful local URLs:

- `http://localhost:5000/health`
- `http://localhost:5000/api/providers`
- `http://localhost:5000/broadcast-tool`
- `http://localhost:5000/api/admin/broadcast`
- `http://localhost:5000/jobNotificationHub`

Swagger UI is only enabled in development.

### Validation Commands

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

Current server tests cover health/provider endpoints, admin broadcast validation, startup validation, Khamsat freshness policy, and Khamsat scraper behavior.

## Operational Notes

- The seen-job cache is in memory only. A process restart clears it.
- The baseline-on-first-scrape behavior avoids replaying the current first page after restart.
- CORS is intentionally permissive for extension development and fails fast in production unless explicit origins are configured.
- Production admin broadcasts require a non-default `AdminToken`.
- Khamsat listing pages are scrapeable with plain HTTP requests, but detail pages may be blocked by upstream WAF challenges.
- The shared scraper base skips obvious Cloudflare or challenge pages instead of attempting to parse them as job HTML.

## Extending To A New Platform

To add a new marketplace:

1. create a new `IJobPlatformScraper` implementation under `src/Platforms/`
2. register it in `Program.cs`
3. make sure each emitted job sets `platformId`
4. update the README and this file with the new platform contract and limitations
