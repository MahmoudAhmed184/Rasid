# Runtime Data Flow

This document traces the main runtime flows through current source modules.

## Polling Flow

```text
alarm/manual check
  -> background runtime handler
  -> runPollingCycle()
  -> platform adapter resolveFeeds()
  -> fetchPlatformFeedJobsResult()
  -> offscreen/local parseListingHtml()
  -> collect per-platform fetch failures
  -> hydrate unseen Khamsat requests for publish-date freshness
  -> storage.ingestJobs()
  -> hydrate newly ingested non-Khamsat jobs where possible
  -> applyJobFilters()
  -> storage.mergeRecentJobs()
  -> publishJobBatch()
  -> notification service + optional audio
```

Important files:

- `src/features/monitoring/run-polling-cycle.ts`
- `src/features/monitoring/fetch-platform-html.ts`
- `src/platforms/registry.ts`
- `src/platforms/*/monitoring.ts`
- `src/platforms/*/html-parser.ts`
- `src/features/monitoring/job-filters.ts`

Polling fetches use `GET`, `credentials: "omit"`, `cache: "no-store"`, `referrerPolicy: "no-referrer"`, and a 15-second timeout. If all enabled platforms fail, the batch result is `kind: "failed"` with per-platform `monitoringErrors`.

## SignalR Flow

```text
background bootstrap
  -> createSignalRManager()
  -> HubConnectionBuilder.withUrl(default backend)
  -> listen for NewJobsDetected
  -> normalizeJobRecord()
  -> processRealtimeJobBatch()
  -> storage.ingestJobs()
  -> publishJobBatch()
  -> notification service + optional audio
```

Admin broadcasts use the same SignalR connection:

```text
AdminMessageReceived
  -> validate id/message/createdAt payload
  -> storage.storeAdminMessage()
  -> notification service showAdminMessageNotification()
  -> popup reads adminMessages and renders unread banner
```

SignalR alarms:

- `jobs:poll`
- `signalr:health`
- `signalr:lease`
- `signalr:reconnect`

The manager uses alarms rather than in-memory reconnect timers as the durable coordination mechanism for MV3 worker suspension.

## Polling Fallback Flow

Fallback triggers include:

- explicit polling mode
- no live SignalR connection during a poll alarm
- failed SignalR connect
- unexpected SignalR close
- health lease expiration
- lease-window rotation

Fallback always delegates to `runPollingCycle()` through `onPollingFallback`.

## Notification Flow

```text
publishJobBatch()
  -> createNotificationService().showJobsNotification()
  -> normalize primary job URL
  -> store notification:<id> payload
  -> browser.notifications.create()

notification click
  -> consumeNotificationPayload()
  -> normalize URL again
  -> browser.tabs.create()
```

Closed notifications remove their stored payload. Stale payloads are pruned on handler registration.

## AI Direct Proposal Flow

```text
content/dashboard action
  -> requestGenerateProposal()
  -> background generateProposal handler
  -> resolve template
  -> renderPromptTemplate()
  -> selected provider adapter
  -> provider HTTP endpoint
  -> normalized direct result
```

Direct provider requests require:

- an unsafe side build with `WXT_ENABLE_UNSAFE_DIRECT_AI=true`
- `settings.aiExecutionMode === "direct"`
- non-empty `settings.aiApiKey`
- non-empty `settings.aiModel`
- supported `settings.aiProvider`
- granted optional provider host permission

## ChatGPT Bridge Flow

```text
generateProposal()
  -> generateBridgeProposal()
  -> setPendingBridgePrompt()
  -> request openChatBridgePrompt
  -> background requests ChatGPT host permission if needed
  -> focus/create ChatGPT tab
  -> browser.scripting.executeScript("/chatgpt-bridge.js")
  -> injected bridge script reads pending prompt
  -> writes input value and dispatches a bubbling input event
  -> clears matching prompt
```

The bridge stores the prompt in `browser.storage.local` because the injected ChatGPT bridge script must be able to read it. The stored record has an ID, target host, creation time, expiry time, and maximum text length.

## Platform Adapter Flow

```text
content entrypoint
  -> adapter.matchPage()
  -> bootstrapPlatformContent()
  -> adapter.ui contributions
  -> contribution mount()
  -> services.prompts/tracking/proposals/downloads
```

Autofill is separate:

```text
content entrypoint
  -> bootstrapPlatformAutofill()
  -> proposalRepository.getQueuedAutofill(platformId)
  -> adapter.applyProposalAutofill()
  -> clear queued draft after applied/not available/expired
```

## Backup Flow

```text
dashboard export
  -> backupRepository.exportAll()
  -> client.get(BACKUP_KEYS)
  -> normalizeStoredStateSnapshot()
  -> normalizeProposalStateBackupPatch()
  -> JSON file

dashboard import
  -> validate object/schema/version
  -> user confirmation
  -> backupRepository.importAll()
  -> normalizeImportedState()
  -> clear pending bridge prompt and invalid autofill drafts
  -> clear current session AI key
```

`adminMessages` is intentionally outside the backup snapshot.

Related docs:

- [`06-storage-and-state.md`](06-storage-and-state.md)
- [`07-runtime-messaging.md`](07-runtime-messaging.md)
- [`08-background-runtime.md`](08-background-runtime.md)
