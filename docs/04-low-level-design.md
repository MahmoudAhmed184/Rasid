# Low-Level Design

This document summarizes lower-level contracts and failure behavior for the current code.

## Background App Composition

`createBackgroundApp()` creates one background app per worker start. It composes:

- `createExtensionStorage()`
- `createNotificationService(storage)`
- `createOffscreenManager({ mode, documentPath })`
- Firefox local ZIP handlers when `import.meta.env.CHROME` is false
- `createAudioService(offscreen)`
- `createDownloadCleanupService(storage, offscreen)`
- `createPlatformMonitoringHtmlParser(offscreen)`
- `createPlatformMonitoringAdapters(htmlParser)`
- direct AI provider loader only when `import.meta.env.WXT_ENABLE_UNSAFE_DIRECT_AI === "true"`
- `createProposalTemplateCatalog(storage)`
- `createProposalGenerator(...)`
- `createSignalRManager(...)`
- `createBackgroundRuntimeHandlers(...)`

The ingestion queue serializes polling and realtime batch processing with a promise chain. This prevents simultaneous polling/realtime writes from racing through shared job storage.

## Storage Normalization

Storage modules normalize data on read and write:

- settings are fully normalized by `normalizeSettings()`
- jobs are normalized by `normalizeJob()`, `normalizeJobs()`, and `mergeJobs()`
- runtime SignalR state is normalized by `normalizeSignalRState()`
- bridge prompts are normalized by `normalizePendingBridgePromptRecord()`
- imports are normalized by `normalizeImportedState()`

Security behavior:

- persistent settings are sanitized so `settings.aiApiKey` is stored as an empty string
- legacy persistent AI keys are migrated to session storage
- backups omit session secrets and pending bridge prompts

## Runtime Message Contract

`BackgroundMessageRequestMap` currently supports:

- `checkNow`
- `testNotification`
- `testSound`
- `updateAlarm`
- `reconnectSignalR`
- `disconnectSignalR`
- `debugFetch`
- `generateProposal`
- `openChatBridgePrompt`
- `downloadZip`

Each action has a request validator and response validator. Unknown or invalid actions are rejected before handler execution.

## Offscreen Task Contract

`OffscreenTask` currently supports:

- `audio.play-notification`
- `downloads.create-zip-url`
- `downloads.revoke-object-url`
- `monitoring.parse-listing-html`
- `monitoring.parse-project-html`

Task payloads and results are validated before and after transport. Chrome sends task envelopes to the offscreen document; Firefox local mode dispatches to registered background handlers.

## Monitoring Contracts

Platform monitoring adapters expose:

- `id`
- `displayName`
- `debugProbeUrl`
- `resolveFeeds(settings)`
- `parseListingHtml(html)`
- `parseProjectHtml(html)`

`runPollingCycle()` deduplicates parsed feed jobs by `platform:id`, stores new jobs, hydrates new records, applies filters, and publishes a batch result.

## AI Contracts

Prompt templates resolve to `ResolvedProposalTemplate` with:

- `id`
- `aiTemplate.system`
- `aiTemplate.user`

`renderPromptTemplate()` builds a `NormalizedAiPrompt` containing:

- trusted `system` text
- user prompt text
- wrapped untrusted variable values

Direct provider adapters implement `AiProviderAdapter.generate()` and return text output or throw categorized `AiProviderError`.

Direct provider calls are reachable only in unsafe side builds. Normal builds normalize `aiExecutionMode` back to `bridge`, and direct generation also requires the selected optional provider host permission.

## Browser APIs Used

| Browser API                        | Current use                                                          |
| ---------------------------------- | -------------------------------------------------------------------- |
| `browser.storage.local`            | Persistent extension state and content-script bridge/autofill state. |
| `browser.storage.session`          | Session-scoped direct-mode API key.                                  |
| `browser.runtime.onMessage`        | Background message bus and offscreen RPC.                            |
| `browser.runtime.sendMessage`      | Popup/dashboard/content/background/offscreen communication.          |
| `browser.alarms`                   | Polling and SignalR lifecycle.                                       |
| `browser.notifications`            | Job and test notifications.                                          |
| `browser.scripting.executeScript`  | Inject packaged ChatGPT bridge script after permission approval.     |
| `browser.tabs.create/query/update` | Open, find, and focus notification URLs and ChatGPT bridge targets.  |
| `browser.downloads`                | ZIP downloads and cleanup reconciliation.                            |
| `chrome.offscreen`                 | Chrome-only offscreen document creation.                             |

## Failure Modes

| Area                            | Failure handling                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Platform fetch                  | Returns sanitized error reason, records runtime monitoring errors, avoids parsing empty/challenge HTML.          |
| Khamsat stale request           | Hydrates unseen request detail, parses publish date, and suppresses stale requests outside the freshness window. |
| No enabled platforms            | Produces a polling `noop` result with `no-platforms`.                                                            |
| Quiet hours                     | Suppresses notification publication but returns batch metadata.                                                  |
| SignalR connect failure         | Schedules reconnect, falls back to polling, logs redacted backend URL.                                           |
| ChatGPT bridge open/inject      | Returns `permission-denied`, `unsupported`, `tab-open-failed`, or `injection-failed`.                            |
| Runtime message invalid payload | Responds with typed transport failure.                                                                           |
| Offscreen invalid response      | Throws `Invalid offscreen response for <task>`.                                                                  |
| Provider HTTP error             | Throws `AiProviderError` categorized by status and metadata.                                                     |
| ZIP attachment failure          | Adds an `.error.txt` entry instead of aborting the whole export where possible.                                  |

Related docs:

- [`07-runtime-messaging.md`](07-runtime-messaging.md)
- [`08-background-runtime.md`](08-background-runtime.md)
- [`reference/source/app-background.md`](reference/source/app-background.md)
