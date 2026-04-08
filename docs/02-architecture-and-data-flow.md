# Architecture And Data Flow

## Runtime Topology

```mermaid
flowchart TD
    BG[entrypoints/background.ts]

    BG --> BAPP[src/application/background/create-background-services.ts]
    BG --> BMSG[src/application/runtime/background-message-bus.ts]

    BAPP --> MON[src/application/monitoring/*]
    BAPP --> PUB[src/application/monitoring/job-batch-publisher.ts]
    BAPP --> PROP[src/application/proposals/*]
    BAPP --> STORE[src/infrastructure/storage/extension-storage.ts]
    BAPP --> NOTIF[src/infrastructure/notifications/service.ts]
    BAPP --> AUDIO[src/infrastructure/audio/service.ts]
    BAPP --> OFF[src/infrastructure/offscreen/manager.ts]
    BAPP --> PHP[src/platforms/monitoring-html-parser.ts]
    BAPP --> PMOD[src/platforms/platform-modules.ts]
    BAPP --> SIG[src/infrastructure/realtime/signalr-manager.ts]

    SIG --> SIGRED[src/infrastructure/realtime/signalr-reducer.ts]
    SIG --> SIGEFF[src/infrastructure/realtime/signalr-effects.ts]

    POP[src/ui/popup/index.ts] --> MSG[src/application/runtime/background-messages.ts]
    POP --> REPOS[src/infrastructure/storage/browser-repositories.ts]

    DASH[src/ui/dashboard/*] --> MSG
    DASH --> REPOS

    MC[entrypoints/mostaql.content/index.ts] --> CBOOT[src/application/content/bootstrapPlatformContent.ts]
    MC --> CAUTO[src/application/content/bootstrapPlatformAutofill.ts]
    MC --> CDEPS[src/application/content/createPlatformContentServices.ts]
    MC --> PMOD
    MC --> REPOS

    KC[entrypoints/khamsat.content/index.ts] --> CBOOT
    KC --> CAUTO
    KC --> CDEPS
    KC --> PMOD
    KC --> REPOS

    PMOD --> MADAPTER[src/platforms/mostaql/adapter.ts]
    PMOD --> KADAPTER[src/platforms/khamsat/adapter.ts]
```

## Background Boot Sequence

`entrypoints/background.ts` is a thin WXT composition root.

It delegates:

- dependency construction to `src/application/background/create-background-services.ts`
- runtime message transport registration to `src/application/runtime/background-message-bus.ts`

On startup the background app:

1. creates storage, notifications, offscreen, audio, monitoring parser, monitoring adapters, AI providers, and the SignalR manager
2. creates proposal-generation and runtime handler services
3. runs:
   - `storage.ensureDefaults()`
   - `offscreen.bootstrap()`
   - `signalr.bootstrap(reason)`
4. registers lifecycle listeners for:
   - `runtime.onInstalled`
   - `runtime.onStartup`
   - `alarms.onAlarm`
   - `runtime.onMessage`
   - notification click handlers

The background layer no longer owns platform registry wiring, notification policy duplication, or raw SignalR state transitions inline.

## Monitoring Control Plane

Monitoring is driven by:

- `src/application/monitoring/run-polling-cycle.ts`
- `src/application/monitoring/process-realtime-job-batch.ts`
- `src/application/monitoring/job-batch-publisher.ts`
- `src/infrastructure/realtime/signalr-manager.ts`

`signalr-manager.ts` decides between:

- disabled
- polling-only
- SignalR-first with polling fallback

That decision depends on:

- `settings.systemEnabled`
- `settings.notificationMode`
- whether any enabled platform module has `realtime.supportsSignalR === true`

The manager still owns connection orchestration, but state logic is now split into:

- `src/infrastructure/realtime/signalr-reducer.ts`
  pure state transitions
- `src/infrastructure/realtime/signalr-effects.ts`
  alarm scheduling and clearing side effects

## Realtime Job Ingest

Realtime job batches flow through:

- `src/application/monitoring/job-records.ts`
- `src/application/monitoring/process-realtime-job-batch.ts`
- `src/application/monitoring/job-batch-publisher.ts`

The realtime path:

1. normalizes incoming hub payloads into `JobRecord`
2. applies platform-enabled and filter checks
3. ingests unseen jobs into normalized storage
4. runs the shared publish policy

The shared publish policy is where these decisions now live:

- quiet-hours suppression
- whether notifications are enabled
- whether notification audio should play
- result shaping for polling vs SignalR callers

The realtime path does not hydrate project HTML after the hub payload arrives.

## Polling Job Ingest

The polling path is owned by:

- `src/application/monitoring/run-polling-cycle.ts`
- `src/application/monitoring/fetch-platform-html.ts`
- `src/application/monitoring/job-batch-publisher.ts`
- `src/platforms/platform-modules.ts`
- `src/platforms/*/monitoring.ts`
- `src/platforms/*/html-parser.ts`

The polling path:

1. resolves enabled platform monitoring adapters from `platform-modules.ts`
2. resolves feed URLs from each adapter
3. fetches listing HTML with `credentials: 'omit'`
4. parses shallow `JobRecord[]` through the platform parser contract
5. ingests unseen jobs
6. hydrates new jobs from project/detail HTML
7. re-applies filters to the hydrated records
8. merges enriched jobs back into recent storage
9. runs the shared publish policy

The background layer never parses platform HTML inline. It always delegates through the monitoring adapter and the offscreen/local HTML parsing bridge.

## Storage Model

There are three storage-facing layers worth keeping separate:

- `src/infrastructure/storage/storage-client.ts`
  the raw `browser.storage.local` boundary
- `src/infrastructure/storage/extension-storage.ts`
  normalized storage access for settings, monitoring, runtime, and notification payloads
- `src/infrastructure/storage/repositories/*`
  domain-focused repositories for popup, dashboard, content scripts, backup, prompts, proposals, and tracking

Proposal bridge/autofill state is handled through:

- `src/infrastructure/storage/modules/proposal-state-storage.ts`

Snapshot import/export normalization is handled through:

- `src/infrastructure/storage/snapshot-state.ts`
- `src/infrastructure/storage/repositories/backup-repository.ts`

## Platform Layer

Platform abstractions live in:

- `src/platforms/contracts.ts`
- `src/platforms/platform-modules.ts`
- `src/platforms/monitoring-html-parser.ts`
- `src/platforms/platform-ids.ts`

Each supported platform module provides:

- a content adapter
- a monitoring adapter factory
- a monitoring HTML parser
- realtime capability metadata

Current concrete implementations live in:

- `src/platforms/mostaql/*`
- `src/platforms/khamsat/*`

There are no longer separate content, monitoring, and parser registries to keep in sync.

## Content Runtime

Platform page entrypoints compose:

- browser repositories
- `PlatformContentServices`
- the selected `PlatformAdapter`

The content runtime then uses:

- `src/application/content/bootstrapPlatformContent.ts`
- `src/application/content/bootstrapPlatformAutofill.ts`

Key runtime rules:

- services are required, not optional
- contributions return `mounted` or `deferred`
- mounted contribution IDs are tracked separately from disposers
- mutation-driven retries only rerun deferred contributions

## Runtime Messages

Popup, dashboard, and content scripts talk to the background through:

- `src/application/runtime/background-messages.ts`

The background implements the contract in:

- `src/application/runtime/background-runtime-handlers.ts`

Important message actions include:

- `checkNow`
- `debugFetch`
- `generateProposal`
- `downloadZip`
- `updateAlarm`
- `reconnectSignalR`
- `disconnectSignalR`

Responses are returned through an explicit success/error transport envelope instead of ad hoc `undefined` handling.
