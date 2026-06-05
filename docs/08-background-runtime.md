# Background Runtime

The background runtime is the coordination point for persistent extension behavior.

## Entrypoint

`entrypoints/background.ts` uses `defineBackground({ type: "module" })` and runs:

- session storage access restriction
- background app creation
- notification handler registration
- download handler registration
- `runtime.onInstalled` bootstrap
- `runtime.onStartup` bootstrap
- `alarms.onAlarm` dispatch
- background message bus registration
- immediate worker-start bootstrap

## Bootstrap

`createBackgroundApp().ensureReady(reason)` runs a single bootstrap promise at a time:

1. `storage.ensureDefaults()`
2. `offscreen.bootstrap()`
3. `downloads.reconcilePendingCleanups()`
4. `signalr.bootstrap(reason)`

Once bootstrapped, later calls return immediately.

## Alarms

The SignalR manager handles these alarm names:

- `jobs:poll`
- `signalr:health`
- `signalr:lease`
- `signalr:reconnect`

`createRecurringSignalREffects()` schedules or clears alarms based on desired transport.

## SignalR Lifecycle

Desired transport is:

- `disabled` when `settings.systemEnabled === false`
- `polling` when no enabled SignalR-capable supported platform exists or notification mode is `polling`
- `signalr` otherwise

SignalR states include:

- `idle`
- `connecting`
- `connected`
- `polling`
- `backoff`
- `suspended`

The manager schedules reconnects with bounded exponential delay capped at 15 minutes.

## Polling Runtime

`runPollingCycle()`:

- exits early when the system is disabled
- exits early when no active platform feeds are enabled
- fetches feed HTML with a 15-second timeout and challenge-page detection
- records per-platform fetch failures in runtime state
- parses listings through platform monitoring adapters
- ingests and deduplicates jobs
- hydrates unseen Khamsat requests for publish-date freshness before ingestion
- hydrates newly ingested jobs where possible
- applies filters
- merges recent jobs
- publishes the batch

## Notifications And Audio

Notifications:

- are created through `browser.notifications.create`
- use platform icons from `/Platforms/Mostql.png`, `/Platforms/Khamsat.png`, and `/Platforms/Nafezly.png`, falling back to `/icons/icon128.png`
- store click payloads before notification creation
- remove payloads when notifications close
- consume payloads on click
- omit rich fields and buttons on Firefox

Admin broadcasts received through SignalR `AdminMessageReceived` are stored in `adminMessages`, trigger `showAdminMessageNotification()`, and appear in the popup unread banner.

Audio:

- uses a generated two-tone `AudioContext` sequence
- runs in offscreen mode on Chrome
- runs through the same task contract in local mode where registered

## Downloads

ZIP downloads:

- are created by offscreen/local task `downloads.create-zip-url`
- are started with `browser.downloads.download({ saveAs: true })`
- are tracked for Blob URL cleanup by download ID
- are revoked after completion/interruption or startup reconciliation

## Validation Commands

```bash
npm run typecheck
npm run lint
npm run build
npm run lint:firefox
```

Related docs:

- [`03-runtime-data-flow.md`](03-runtime-data-flow.md)
- [`07-runtime-messaging.md`](07-runtime-messaging.md)
