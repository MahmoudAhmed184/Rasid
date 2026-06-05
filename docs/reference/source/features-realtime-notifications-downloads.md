# Source Reference: Features - Realtime, Notifications, Downloads, Offscreen

Runtime context: background service worker/script, Chrome offscreen document, Firefox local task path.

## Realtime

### `src/features/realtime/constants.ts`

Purpose: SignalR alarm and timing constants.

Exports:

- `DEFAULT_SIGNALR_URL`
- `SIGNALR_HEALTH_INTERVAL_MINUTES = 1`
- `SIGNALR_LEASE_WINDOW_MS = 4.5 * 60 * 1000`
- `SIGNALR_LEASE_WINDOW_MINUTES`
- `SIGNALR_RECONNECT_DELAY_MINUTES = 1`
- `ALARM_NAMES`

No functions.

### `src/features/realtime/signalr-reducer.ts`

Purpose: pure SignalR state machine and desired transport calculation.

Important constants:

- `MAX_RECONNECT_DELAY_MINUTES = 15`

Functions:

| Function                                      | Purpose                                      | Inputs                        | Outputs                  | Side effects, errors, security                                                |
| --------------------------------------------- | -------------------------------------------- | ----------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `resolveServerUrl(current, serverUrl?)`       | Resolves backend URL for transition state.   | current state, optional URL   | string                   | Uses packaged default resolver.                                               |
| `resolveDesiredTransport(settings)`           | Chooses `disabled`, `polling`, or `signalr`. | settings                      | transport                | Uses system toggle, enabled SignalR-capable platforms, and notification mode. |
| `computeReconnectDelayMinutes(attempt)`       | Computes bounded reconnect backoff.          | attempt number                | minutes                  | Minimum one minute, max 15 minutes.                                           |
| `reduceSignalRState(current, event, context)` | Applies one SignalR event.                   | current state, event, context | transition state/effects | Pure reducer; effects are alarm commands consumed elsewhere.                  |

Events handled:

- `ENTER_IDLE`
- `ENTER_POLLING`
- `ENTER_SUSPENDED`
- `ENTER_CONNECTING`
- `ENTER_CONNECTED`
- `REFRESH_LEASE`
- `SCHEDULE_RECONNECT`

### `src/features/realtime/signalr-effects.ts`

Purpose: converts reducer effects into browser alarms.

Functions:

| Function                                                           | Purpose                                             | Inputs              | Outputs         | Side effects, errors, security                  |
| ------------------------------------------------------------------ | --------------------------------------------------- | ------------------- | --------------- | ----------------------------------------------- |
| `createRecurringSignalREffects(desiredTransport, pollingInterval)` | Returns recurring alarm effects for transport mode. | transport, interval | effect array    | Clears irrelevant alarms when disabled/polling. |
| `executeSignalREffects(effects)`                                   | Applies alarm effects.                              | effect array        | `Promise<void>` | Calls `browser.alarms.clear/create`.            |

### `src/features/realtime/signalr-manager.ts`

Purpose: runtime SignalR connection manager and polling fallback coordinator.

Key dependency: `@microsoft/signalr`.

Functions:

| Function                                                       | Purpose                                                                                            | Inputs                                | Outputs                 | Side effects, errors, security                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `safeErrorLabel(error)`                                        | Reduces error to safe label.                                                                       | unknown                               | string                  | Avoids logging full error detail in some paths.                                                  |
| `isAdminMessagePayload(value)`                                 | Validates backend admin broadcast payload.                                                         | unknown                               | type guard              | Requires `id`, non-empty `message`, and `createdAt`.                                             |
| `isDue(dateText, nowValue)`                                    | Checks scheduled time.                                                                             | ISO/null, date                        | boolean                 | Treats missing/invalid as due.                                                                   |
| `createSignalRManager(options)`                                | Creates SignalR manager.                                                                           | storage, job callbacks, logger, clock | `SignalRManager`        | Owns `HubConnection`, alarms, state transitions, fallback calls.                                 |
| `applySignalRTransition(current, event)` inner                 | Reduces state, executes alarm effects, persists state.                                             | state, event                          | `Promise<SignalRState>` | Writes runtime storage.                                                                          |
| `syncRecurringAlarms(settings)` inner                          | Schedules base alarms for desired transport.                                                       | settings                              | transport               | Calls alarm effects.                                                                             |
| `stopConnection(event)` inner                                  | Stops active connection and persists terminal state.                                               | transition event                      | `Promise<void>`         | Uses `HubConnection.stop()`, tracks intentional closes.                                          |
| `refreshLeaseFromEvent(serverUrl)` inner                       | Extends live lease after inbound event.                                                            | server URL                            | `Promise<void>`         | Updates runtime SignalR state.                                                                   |
| `scheduleReconnect(reason, config?)` inner                     | Persists backoff/polling reconnect state.                                                          | reason/config                         | `Promise<void>`         | Schedules reconnect alarm when desired transport is SignalR.                                     |
| `healSuspendedLiveSession(reason)` inner                       | Detects expired/stale live sessions.                                                               | reason                                | reason or `null`        | Moves stale runtime state to suspended.                                                          |
| `normalizeEnvelope(payload)` inner                             | Normalizes SignalR payload to jobs.                                                                | unknown                               | job array               | Drops invalid/unsupported jobs.                                                                  |
| `handleInboundJobs(boundConnection, serverUrl, payload)` inner | Processes `NewJobsDetected`.                                                                       | connection, URL, payload              | `Promise<void>`         | Ignores stale connections; refreshes lease; calls job callback.                                  |
| `handleUnexpectedClose(serverUrl, error)` inner                | Handles unintentional close.                                                                       | URL, error                            | `Promise<void>`         | Schedules reconnect, runs polling fallback, logs redacted URL.                                   |
| `bindHandlers(boundConnection, serverUrl)` inner               | Attaches hub event handlers.                                                                       | connection, URL                       | `void`                  | Listens for `NewJobsDetected`, `AdminMessageReceived`, and close events.                         |
| `connectLiveTransport(reason)` inner                           | Connects SignalR when due.                                                                         | reason                                | `Promise<void>`         | Builds hub connection with WebSockets, SSE, Long Polling; applies connected/backoff transitions. |
| `ensureDisabledState(reason)` inner                            | Enters idle disabled state.                                                                        | reason                                | `Promise<void>`         | Stops connection.                                                                                |
| `ensurePollingMode(reason)` inner                              | Enters polling mode.                                                                               | reason                                | `Promise<void>`         | Stops connection and clears reconnect state.                                                     |
| `bootstrap(reason?)`                                           | Ensures defaults, recurring alarms, desired transport, stale-session healing, and live connection. | optional reason                       | `Promise<void>`         | Shared bootstrap promise.                                                                        |
| `handleJobPollingAlarm()` inner                                | Handles periodic job polling alarm.                                                                | none                                  | `Promise<void>`         | Runs fallback polling when needed.                                                               |
| `handleHealthAlarm()` inner                                    | Handles SignalR health alarm.                                                                      | none                                  | `Promise<void>`         | Detects lease expiry/no connection and falls back.                                               |
| `handleLeaseAlarm()` inner                                     | Rotates out of live socket before lease window ends.                                               | none                                  | `Promise<void>`         | Enters polling, schedules reconnect.                                                             |
| `handleAlarm(alarm)`                                           | Dispatches SignalR alarm.                                                                          | browser alarm                         | `Promise<boolean>`      | Returns false for unknown alarm names.                                                           |
| `reconnect(reason?)`                                           | Manual reconnect.                                                                                  | optional reason                       | `Promise<void>`         | Stops and reconnects.                                                                            |
| `disconnect(reason?)`                                          | Manual disconnect into polling.                                                                    | optional reason                       | `Promise<void>`         | Stops and persists polling mode.                                                                 |

## Notifications

### `src/features/notifications/service.ts`

Purpose: browser notification service and click payload lifecycle.

Constants:

- `NOTIFICATION_ALLOWED_HOSTS = ["mostaql.com", "khamsat.com", "nafezly.com"]`
- job notification IDs start with `frelancia-`
- admin notification IDs start with `frelancia-admin-`

Functions:

| Function                                  | Purpose                                                 | Inputs                             | Outputs               | Side effects, errors, security                                       |
| ----------------------------------------- | ------------------------------------------------------- | ---------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `normalizeNotificationUrl(value)`         | Validates notification target URL.                      | URL string                         | URL string or `null`  | Requires HTTPS and supported platform host; strips credentials/hash. |
| `getNotificationIcon(platformId)`         | Resolves notification icon asset.                       | platform ID/undefined              | URL string            | Uses platform icons or fallback extension icon.                      |
| `buildNotificationOptions(options)`       | Builds cross-browser notification options.              | icon/title/message/context/buttons | notification options  | Omits context message and buttons in Firefox.                        |
| `buildNotificationBody(jobs)`             | Creates Arabic notification title/body.                 | jobs                               | title/message/primary | Uses primary job and platform labels.                                |
| `createNotificationService(storage)`      | Creates notification service.                           | extension storage                  | `NotificationService` | Registers click/close handlers; stores and prunes click payloads.    |
| `registerHandlers()` inner                | Registers notification listeners once.                  | none                               | `void`                | Consumes payloads on click and opens tabs for normalized URLs.       |
| `showJobsNotification(jobs)` inner        | Stores payload and creates notification.                | job array                          | notification ID       | Removes payload if `browser.notifications.create()` fails.           |
| `showAdminMessageNotification(msg)` inner | Stores optional payload and creates admin notification. | admin message                      | notification ID       | Uses fallback icon and optional normalized URL payload.              |
| `showTestNotification()` inner            | Creates test notification.                              | none                               | notification ID       | Uses Mostaql projects URL.                                           |

### `src/features/notifications/audio-service.ts`

Purpose: generated notification audio service.

Functions:

| Function                                                 | Purpose                                         | Inputs                           | Outputs               | Side effects, errors, security                                        |
| -------------------------------------------------------- | ----------------------------------------------- | -------------------------------- | --------------------- | --------------------------------------------------------------------- |
| `getAudioContextCtor()`                                  | Returns global `AudioContext`.                  | none                             | constructor/undefined | Internal feature detection.                                           |
| `playTone(audioContext, frequency, startTime, duration)` | Plays one sine tone.                            | audio context, frequency, timing | oscillator            | Creates oscillator/gain nodes.                                        |
| `playSequence(steps)`                                    | Plays tone sequence and closes context.         | tone steps                       | `Promise<void>`       | Throws if `AudioContext` is unavailable; closes context in `finally`. |
| `playNotificationAudioDirect()`                          | Plays Frelancia notification sound.             | none                             | `Promise<void>`       | Two-tone generated sound.                                             |
| `createAudioService(offscreen)`                          | Registers audio task and returns audio service. | offscreen manager                | `AudioService`        | Uses offscreen/local task contract.                                   |

## Downloads

### `src/features/downloads/download-cleanup-service.ts`

Purpose: tracks and revokes offscreen Blob URLs after downloads finish.

Functions:

| Function                                           | Purpose                                       | Inputs                  | Outputs                  | Side effects, errors, security                                                         |
| -------------------------------------------------- | --------------------------------------------- | ----------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| `revokeOffscreenObjectUrl(offscreen, objectUrl)`   | Requests Blob URL revocation.                 | offscreen manager, URL  | `Promise<void>`          | Logs cleanup failures.                                                                 |
| `isTerminalDownloadState(item)`                    | Checks complete/interrupted/missing download. | download item/undefined | boolean                  | Used during reconciliation.                                                            |
| `createDownloadCleanupService(storage, offscreen)` | Creates download cleanup service.             | storage, offscreen      | `DownloadCleanupService` | Registers `downloads.onChanged`, persists cleanup records, reconciles pending records. |
| `cleanup(payload)` inner                           | Revokes one Blob URL.                         | cleanup record          | `Promise<void>`          | Calls offscreen revoke task.                                                           |
| `consumeAndCleanup(downloadId)` inner              | Consumes record and cleans up.                | download ID             | `Promise<void>`          | Removes storage record before cleanup.                                                 |

### `src/features/downloads/zip-downloads.ts`

Purpose: bounded ZIP archive creation and Blob URL lifecycle.

Important constants:

- `MAX_ZIP_ENTRIES = 80`
- `MAX_REMOTE_FILE_BYTES = 10 * 1024 * 1024`
- `MAX_TOTAL_ENTRY_BYTES = 50 * 1024 * 1024`
- `REMOTE_FETCH_TIMEOUT_MS = 15_000`
- `ZIP_ALLOWED_REMOTE_HOSTS = ["mostaql.com", "khamsat.com", "nafezly.com"]`

Functions:

| Function                                | Purpose                                    | Inputs                                | Outputs                 | Side effects, errors, security                                                         |
| --------------------------------------- | ------------------------------------------ | ------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `createCrc32Table()`                    | Builds CRC32 lookup table.                 | none                                  | `Uint32Array`           | Pure initialization.                                                                   |
| `calculateCrc32(data)`                  | Computes CRC32 for ZIP entry.              | bytes                                 | number                  | Pure.                                                                                  |
| `toUint8Array(value)`                   | Encodes string or ArrayBuffer.             | string/ArrayBuffer                    | bytes                   | Pure.                                                                                  |
| `normalizeZipEntryName(name, fallback)` | Sanitizes ZIP path.                        | name, fallback                        | string                  | Removes drive roots and `.`/`..` path segments.                                        |
| `createUniqueName(name, usedNames)`     | Avoids duplicate ZIP names.                | name, set                             | unique name             | Mutates `usedNames`.                                                                   |
| `sanitizeDownloadFilename(filename)`    | Sanitizes archive filename.                | filename                              | string                  | Replaces invalid filename characters.                                                  |
| `getDosDateTime(date)`                  | Encodes ZIP DOS timestamp.                 | date                                  | time/date numbers       | Pure.                                                                                  |
| `writeUint16()` / `writeUint32()`       | Writes little-endian ZIP fields.           | DataView, offset, value               | `void`                  | Binary encoding.                                                                       |
| `createLocalFileHeader()`               | Creates ZIP local header.                  | entry, CRC, name bytes                | bytes                   | Pure binary construction.                                                              |
| `createCentralDirectoryRecord()`        | Creates central directory record.          | entry, CRC, name bytes, offset        | record                  | Pure binary construction.                                                              |
| `createEndOfCentralDirectory()`         | Creates ZIP end record.                    | counts/sizes/offset                   | bytes                   | Pure binary construction.                                                              |
| `assertZip32Limit(label, value)`        | Enforces ZIP32 limits.                     | label, value                          | throws/void             | Throws when values exceed ZIP32.                                                       |
| `isAllowedRemoteHost(hostname)`         | Checks ZIP remote host.                    | hostname                              | boolean                 | Exact/subdomain match against supported platform hosts.                                |
| `parseAllowedRemoteUrl(value)`          | Validates remote attachment URL.           | URL string                            | `URL`                   | Requires HTTPS supported host; strips credentials/hash.                                |
| `parseContentLength(value)`             | Parses response content length.            | header string/null                    | number/null             | Rejects invalid numeric values.                                                        |
| `toBlobPart(bytes)`                     | Copies bytes to ArrayBuffer.               | bytes                                 | ArrayBuffer             | Avoids shared-buffer issues.                                                           |
| `createZipBlob(entries)`                | Builds ZIP Blob.                           | resolved entries                      | `Blob`                  | Enforces entry count and ZIP32 size limits.                                            |
| `readFileEntry(file, remainingBytes)`   | Reads inline content or remote attachment. | ZIP file input, remaining byte budget | string/ArrayBuffer/null | Remote fetch uses `credentials: "include"`, no-store, no-referrer, timeout, byte caps. |
| `createResolvedEntries(files)`          | Resolves and caps ZIP entries.             | input files                           | entries                 | Adds `.error.txt` entries for skipped attachments; caps count and total bytes.         |
| `createZipObjectUrl(filename, files)`   | Creates ZIP Blob URL result.               | filename, files                       | success/error object    | Returns `URL.createObjectURL(blob)` on success; catches errors.                        |
| `revokeZipObjectUrl(objectUrl)`         | Revokes Blob URL.                          | object URL                            | `void`                  | Calls `URL.revokeObjectURL()`.                                                         |

## Offscreen

### `src/features/offscreen/manager.ts`

Purpose: shared Chrome offscreen and Firefox local task protocol.

Important constants:

- `OFFSCREEN_RPC_CHANNEL = "rasid:offscreen"`
- `OFFSCREEN_TASKS`
- `MAX_ZIP_TASK_FILES = 80`

Functions:

| Function                                                                                    | Purpose                                                 | Inputs                              | Outputs            | Side effects, errors, security                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `getChromeApi()`                                                                            | Reads global Chrome offscreen API.                      | none                                | API or `null`      | Chrome feature detection.                                                                         |
| `getOffscreenDocumentUrl(documentPath)`                                                     | Converts extension HTML path for Chrome createDocument. | path                                | string             | Removes leading slash.                                                                            |
| `isOffscreenTask(value)`                                                                    | Validates task name.                                    | unknown                             | type guard         | Protocol guard.                                                                                   |
| `isRecord()` / `hasNoFields()`                                                              | Payload guards.                                         | unknown                             | boolean/type guard | Protocol validation.                                                                              |
| `isZipEntryInput()` / `isZipPayload()` / `isRevokePayload()`                                | Validate download task payloads.                        | unknown                             | type guards        | Caps ZIP task files and validates fields.                                                         |
| `isMonitoringHtmlPayload()`                                                                 | Validates parser task payload.                          | unknown                             | type guard         | Requires known platform ID and HTML string.                                                       |
| `isPayloadForTask(task, payload)`                                                           | Validates payload by task.                              | task, payload                       | type guard         | Dispatch gate.                                                                                    |
| `isSuccessResult()` / `isZipObjectUrlResult()` / `isJobRecord()` / `isProjectParseResult()` | Validate task results.                                  | unknown                             | type guards        | Response validation.                                                                              |
| `isResultForTask(task, data)`                                                               | Validates result by task.                               | task, data                          | type guard         | Caller response gate.                                                                             |
| `isOffscreenProtocolMessage(value)`                                                         | Validates task envelope.                                | unknown                             | type guard         | Requires channel, background source, request ID, task, and valid payload.                         |
| `isOffscreenTransportResponseForTask(value, task, requestId)`                               | Validates transport response.                           | value, task, ID                     | type guard         | Ensures request ID and task match.                                                                |
| `createOffscreenTransportSuccess()` / `createOffscreenTransportFailure()`                   | Build transport envelopes.                              | task, data/error, ID                | response           | Pure.                                                                                             |
| `dispatchOffscreenTask(handlers, message)`                                                  | Routes task to handler.                                 | handlers, envelope                  | task result        | Exhaustive switch.                                                                                |
| `createOffscreenManager(options)`                                                           | Creates offscreen/local manager.                        | mode, document path, local handlers | `OffscreenManager` | Creates Chrome offscreen document when needed; sends runtime messages; dispatches local handlers. |

### `src/features/offscreen/tasks.ts`

Purpose: typed helpers for registering/requesting offscreen tasks.

Functions:

| Function                                                         | Purpose                          | Inputs                       | Outputs                  | Side effects                               |
| ---------------------------------------------------------------- | -------------------------------- | ---------------------------- | ------------------------ | ------------------------------------------ |
| `registerNotificationAudioTask(offscreen, playNotification)`     | Registers audio local handler.   | offscreen, function          | `void`                   | Local handler returns `{ success: true }`. |
| `requestNotificationAudioTask(offscreen)`                        | Requests notification audio.     | offscreen                    | `Promise<void>`          | Sends task through offscreen manager.      |
| `registerMonitoringHtmlParserTasks(offscreen, handlers)`         | Registers local parser handlers. | offscreen, parser handlers   | `void`                   | Used for local/offscreen parser execution. |
| `requestMonitoringListingHtmlParse(offscreen, platformId, html)` | Requests listing parse.          | offscreen, platform ID, HTML | jobs promise             | Uses offscreen task protocol.              |
| `requestMonitoringProjectHtmlParse(offscreen, platformId, html)` | Requests project parse.          | offscreen, platform ID, HTML | partial job/null promise | Uses offscreen task protocol.              |

### `src/app/offscreen/bootstrap-offscreen.ts`

Purpose: Chrome offscreen document message handler.

Functions:

| Function                           | Purpose                                                | Inputs             | Outputs     | Side effects, errors, security                                                                 |
| ---------------------------------- | ------------------------------------------------------ | ------------------ | ----------- | ---------------------------------------------------------------------------------------------- |
| `handleTask(message)`              | Dispatches validated offscreen task to handlers.       | offscreen envelope | task result | Calls audio, ZIP, or parser handlers.                                                          |
| `isTrustedOffscreenSender(sender)` | Validates offscreen message sender.                    | runtime sender     | boolean     | Requires same extension ID and no tab sender.                                                  |
| `initOffscreen()`                  | Registers offscreen `runtime.onMessage` listener once. | none               | `void`      | Validates protocol/sender, sends success/failure responses, keeps async response channel open. |

Related docs:

- [`../../08-background-runtime.md`](../../08-background-runtime.md)
- [`../../07-runtime-messaging.md`](../../07-runtime-messaging.md)
