# Source Reference: App Background

Runtime context: background service worker/script.

## `src/app/background/create-background-services.ts`

Purpose: background composition root.

Key imports: monitoring polling/realtime processors, proposal generator/catalog, AI provider registry, download/audio/notification/offscreen/SignalR services, storage, platform monitoring registry.

Exports:

- `BackgroundApp`
- `createBackgroundApp()`

Functions and nested functions:

| Function                             | Purpose                                                                    | Inputs        | Outputs                   | Side effects, errors, security                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBackgroundApp()`              | Composes all background services and returns the background app API.       | none          | `BackgroundApp`           | Creates storage clients, services, adapters, provider registry, SignalR manager, and handlers. Uses Chrome offscreen document mode only when `import.meta.env.CHROME`. |
| `enqueueIngestion(task)`             | Serializes polling and realtime ingestion tasks.                           | async task    | task result               | Maintains a promise chain so storage ingestion is not concurrent.                                                                                                      |
| `runPolling(reason)`                 | Runs a polling cycle through the ingestion queue.                          | reason string | `Promise<JobBatchResult>` | Fetches marketplace HTML, stores jobs, may notify and play audio.                                                                                                      |
| `signalr.onJobsReceived` callback    | Processes realtime jobs through the ingestion queue.                       | jobs          | `Promise<void>`           | Normalizes, stores, filters, and publishes SignalR job batches.                                                                                                        |
| `signalr.onPollingFallback` callback | Runs polling fallback.                                                     | reason        | `Promise<void>`           | Delegates to `runPolling()`.                                                                                                                                           |
| `bootstrap(reason)`                  | Initializes storage, offscreen/local tasks, download cleanup, and SignalR. | reason string | `Promise<void>`           | Writes defaults, creates offscreen document in Chrome, reconciles downloads, schedules/connects SignalR.                                                               |
| `ensureReady(reason)`                | Runs bootstrap once and shares in-flight bootstrap work.                   | reason string | `Promise<void>`           | Prevents duplicate bootstrap; subsequent calls return after `isBootstrapped`.                                                                                          |

## `src/app/background/background-messages.ts`

Purpose: typed background runtime message contract, validators, transport helpers, and callers.

Automated coverage:

- `tests/src/app/background/background-messages.test.ts` validates action recognition, proposal-context bounds, ZIP message bounds, transport response guards, and dispatch routing.

Key imports:

- `browser`
- `GenerateProposalRequest/Response`
- `ZipEntryInput`
- `normalizeAiChatUrl`
- `isAllowedPlatformHostname`

Exports:

- request/response maps and transport types
- validator helpers
- transport creators
- `dispatchBackgroundMessage()`
- `sendBackgroundMessage()`
- request helper functions

Important constants:

| Constant                            | Value / role                                 |
| ----------------------------------- | -------------------------------------------- |
| `BACKGROUND_ACTIONS`                | Allowed background actions.                  |
| `MAX_ZIP_MESSAGE_FILES`             | 80 ZIP entries per message.                  |
| `MAX_GENERATE_TEMPLATE_ID_LENGTH`   | 120 characters.                              |
| `MAX_AI_CONTEXT_TITLE_LENGTH`       | 300 characters.                              |
| `MAX_AI_CONTEXT_DESCRIPTION_LENGTH` | 8000 characters.                             |
| `MAX_AI_CONTEXT_FIELD_LENGTH`       | 1000 characters.                             |
| `MAX_AI_CONTEXT_URL_LENGTH`         | 2048 characters.                             |
| `MAX_AI_CONTEXT_TAGS`               | 30 tags.                                     |
| `MAX_AI_CONTEXT_ATTACHMENTS`        | 10 attachments.                              |
| `AI_CONTEXT_URL_HOSTS`              | `khamsat.com`, `mostaql.com`, `nafezly.com`. |

Functions:

| Function                                   | Purpose                                            | Inputs            | Outputs                | Side effects, errors, security                                |
| ------------------------------------------ | -------------------------------------------------- | ----------------- | ---------------------- | ------------------------------------------------------------- |
| `isRecord()`                               | Checks for a non-array object.                     | unknown           | type guard             | Used by validators.                                           |
| `hasOnlyAction()`                          | Verifies message action.                           | record, action    | boolean                | Prevents action mismatch.                                     |
| `isFiniteNumber()`                         | Checks finite number.                              | unknown           | type guard             | Numeric validation.                                           |
| `isBoundedString()`                        | Checks non-empty string within limit.              | value, max        | type guard             | Used for AI context bounds.                                   |
| `isOptionalBoundedString()`                | Checks optional bounded string.                    | value, max        | type guard             | Allows absent optional fields.                                |
| `isAllowedAiContextUrl()`                  | Validates HTTPS platform URL for proposal context. | unknown           | type guard             | Enforces host allowlist and URL length.                       |
| `isStringArray()`                          | Validates tags array.                              | unknown           | type guard             | Caps count and item length.                                   |
| `isProjectAttachment()`                    | Validates attachment shape.                        | unknown           | boolean                | Requires bounded name and allowed URL.                        |
| `isAiRequestContext()`                     | Validates proposal generation context.             | unknown           | type guard             | Rejects oversized/untrusted payloads before prompt rendering. |
| `isZipEntryInput()`                        | Validates ZIP entry input.                         | unknown           | type guard             | Requires name and content or URL.                             |
| `isJobBatchResult()`                       | Validates polling/SignalR batch result.            | unknown           | type guard             | Ensures transport response shape.                             |
| `isSuccessResult()`                        | Validates `{ success: true }`.                     | unknown           | type guard             | Used by simple actions.                                       |
| `isDebugFetchResult()`                     | Validates diagnostics response.                    | unknown           | type guard             | Accepts success, length, error.                               |
| `isGenerateProposalResponse()`             | Validates proposal response.                       | unknown           | type guard             | Bridge URL must normalize to itself.                          |
| `isZipDownloadResult()`                    | Validates ZIP download response.                   | unknown           | type guard             | Ensures optional download ID/error types.                     |
| `isUpdateAlarmMessage()`                   | Validates `updateAlarm`.                           | record            | type guard             | Optional interval must be finite.                             |
| `isGenerateProposalMessage()`              | Validates `generateProposal`.                      | record            | type guard             | Enforces template/context constraints.                        |
| `isDownloadZipMessage()`                   | Validates `downloadZip`.                           | record            | type guard             | Caps file count and validates entries.                        |
| `getBackgroundMessageAction()`             | Extracts known action.                             | unknown           | action or `null`       | Unknown actions are ignored by bus.                           |
| `isBackgroundRuntimeMessage()`             | Validates any background request.                  | unknown           | type guard             | Dispatch gate.                                                |
| `isBackgroundTransportResponseForAction()` | Validates response for action.                     | value, action     | type guard             | Caller-side response guard.                                   |
| `createBackgroundTransportSuccess()`       | Builds success envelope.                           | action, data      | transport response     | No side effects.                                              |
| `createBackgroundTransportFailure()`       | Builds failure envelope.                           | action, error     | transport response     | No side effects.                                              |
| `dispatchBackgroundMessage()`              | Routes message to matching handler.                | handlers, message | handler result         | Exhaustive switch over known actions.                         |
| `sendBackgroundMessage()`                  | Sends and validates a runtime message.             | typed request     | typed response promise | Throws on invalid response or transport failure.              |
| `requestCheckNow()`                        | Sends `checkNow`.                                  | none              | `JobBatchResult`       | Triggers polling via background.                              |
| `requestTestNotification()`                | Sends `testNotification`.                          | none              | success                | Creates test notification.                                    |
| `requestTestSound()`                       | Sends `testSound`.                                 | none              | success                | Plays audio through background/offscreen.                     |
| `requestUpdateAlarm()`                     | Sends `updateAlarm`.                               | optional interval | success                | Updates settings and SignalR bootstrap.                       |
| `requestReconnectSignalR()`                | Sends `reconnectSignalR`.                          | none              | success                | Reconnects SignalR.                                           |
| `requestDisconnectSignalR()`               | Sends `disconnectSignalR`.                         | none              | success                | Enters polling mode.                                          |
| `requestDebugFetch()`                      | Sends `debugFetch`.                                | none              | diagnostics            | Fetches enabled source probes.                                |
| `requestGenerateProposal()`                | Sends `generateProposal`.                          | request           | proposal response      | Subject to payload validation and sender checks.              |
| `requestDownloadZip()`                     | Sends `downloadZip`.                               | filename, files   | download result        | Subject to ZIP validators and host limits downstream.         |

## `src/app/background/background-message-bus.ts`

Purpose: background runtime message listener and sender trust boundary.

Important constants:

- `TRUSTED_CONTENT_SCRIPT_HOSTS`: `chat.openai.com`, `chatgpt.com`, `khamsat.com`, `mostaql.com`, `nafezly.com`

Functions:

| Function                                       | Purpose                                                            | Inputs                                   | Outputs | Side effects, errors, security                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `isTrustedRuntimeSender(sender)`               | Checks same-extension sender or allowed HTTPS content-script host. | runtime sender                           | boolean | Rejects other extension IDs and untrusted URLs.                                                                                       |
| `registerBackgroundRuntimeMessageBus(options)` | Registers `browser.runtime.onMessage` listener.                    | `ensureReady`, handlers, optional logger | `void`  | Ignores offscreen RPC, validates action/sender/payload, bootstraps background before dispatch, sends typed success/failure responses. |

Browser APIs: `browser.runtime.onMessage`, `browser.runtime.id`, `browser.runtime.getURL`.

Testing note: sender trust and malformed-payload rejection are release-critical and should remain covered by background integration tests when the message bus changes.

## `src/app/background/background-runtime-handlers.ts`

Purpose: implementation of background actions.

Exports:

- `createBackgroundRuntimeHandlers()`

Functions:

| Function                                | Purpose                                                                            | Inputs                                                                                            | Outputs                       | Side effects, errors, security                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `downloadZip(deps, message)`            | Creates ZIP object URL through offscreen/local task and starts a browser download. | background deps, download message                                                                 | `ZipDownloadResult`           | Uses `browser.downloads.download`; revokes object URL on immediate download failure; persists cleanup record after successful start. |
| `createBackgroundRuntimeHandlers(deps)` | Builds action handlers.                                                            | storage, notifications, downloads, audio, offscreen, SignalR, monitoring, proposals, `runPolling` | `BackgroundMessageHandlerMap` | Maps runtime actions to background services. `debugFetch` only probes enabled platform adapters.                                     |

Action behavior:

- `checkNow`: `runPolling("manual-check")`
- `testNotification`: creates test notification
- `testSound`: plays notification sound
- `updateAlarm`: updates interval and re-bootstrap SignalR
- `reconnectSignalR`: reconnects
- `disconnectSignalR`: disconnects into polling
- `debugFetch`: fetches enabled monitoring source probes
- `generateProposal`: delegates to proposal generator
- `downloadZip`: delegates to `downloadZip()`

Related docs:

- [`../../07-runtime-messaging.md`](../../07-runtime-messaging.md)
- [`features-realtime-notifications-downloads.md`](features-realtime-notifications-downloads.md)
