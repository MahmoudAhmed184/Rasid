# Source Reference: Shared Browser And Storage

Runtime contexts: background, extension pages, content scripts, offscreen/local task users.

## `src/shared/browser/storage-client.ts`

Purpose: browser storage wrapper and session storage access restriction.

Functions:

| Function                                           | Purpose                           | Inputs                                  | Outputs         | Side effects, errors, security                                                                                          |
| -------------------------------------------------- | --------------------------------- | --------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `createStorageClient(storageArea)`                 | Wraps a browser storage area.     | `browser.storage.local`-compatible area | `StorageClient` | Normalizes get/remove keys; delegates to browser storage.                                                               |
| `createBrowserStorageClient()`                     | Creates local storage client.     | none                                    | `StorageClient` | Uses `browser.storage.local`.                                                                                           |
| `createBrowserSessionStorageClient()`              | Creates session storage client.   | none                                    | `StorageClient` | Uses `browser.storage.session`.                                                                                         |
| `restrictBrowserSessionStorageToTrustedContexts()` | Restricts session storage access. | none                                    | `Promise<void>` | Calls `browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`; logs warning if unsupported/fails. |

## `src/shared/storage/schema.ts`

Purpose: central storage types and defaults.

Exports:

- `StoredNotificationPayload`
- `PendingDownloadCleanup`
- `StoredState`
- `MAX_SEEN_JOBS = 500`
- `MAX_RECENT_JOBS = 50`
- `DEFAULT_PROMPTS`
- `DEFAULT_AI_SYSTEM_PROMPT`
- `DEFAULT_PROPOSAL_TEMPLATE`
- `DEFAULT_SETTINGS`
- `DEFAULT_STATS`
- `DEFAULT_RUNTIME_STATE`

No functions.

## `src/shared/storage/storage-keys.ts`

Purpose: storage key constants.

Exports:

- `STORAGE_FIELDS`
- `SNAPSHOT_KEYS`
- `NOTIFICATION_KEY_PREFIX = "notification:"`
- `DOWNLOAD_CLEANUP_KEY_PREFIX = "download-cleanup:"`

No functions.

## `src/shared/storage/extension-storage.ts`

Purpose: unified storage facade over storage modules.

Exports:

- `ExtensionStorage`
- `IngestedJobsResult`
- `RuntimeStatePatch`
- `createExtensionStorage()`

Functions:

| Function                                         | Purpose                                         | Inputs                                       | Outputs              | Side effects, errors, security                                                           |
| ------------------------------------------------ | ----------------------------------------------- | -------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `jsonEqual(left, right)`                         | Compares JSON-serializable values.              | two values                                   | boolean              | Used to detect default normalization patches.                                            |
| `createExtensionStorage(client?, secretClient?)` | Creates facade over all storage modules.        | local storage client, session storage client | `ExtensionStorage`   | Migrates legacy API key on `ensureDefaults`, normalizes snapshots, delegates to modules. |
| `readSnapshotFields()` inner                     | Reads persistent snapshot keys.                 | none                                         | raw record           | Browser storage read.                                                                    |
| `writePatch(patch)` inner                        | Writes non-empty snapshot patch.                | partial state                                | `Promise<void>`      | Browser storage write.                                                                   |
| `getSnapshot()` inner                            | Reads normalized stored state.                  | none                                         | `StoredState`        | Normalization only.                                                                      |
| `ensureDefaults()` inner                         | Normalizes and persists missing/stale defaults. | none                                         | `StoredState`        | Migrates legacy AI key to session storage and writes normalized persistent state.        |
| `ingestJobs(jobs)` inner                         | Ingests jobs against current snapshot.          | jobs                                         | `IngestedJobsResult` | Writes seen/recent/stats through monitoring storage.                                     |
| `mergeRecentJobs(jobs)` inner                    | Merges recent jobs.                             | jobs                                         | job array            | Writes recent jobs.                                                                      |
| `touchLastCheck(reason)` inner                   | Updates last-check stats/runtime.               | reason                                       | stats                | Writes monitoring/runtime fields.                                                        |

Additional facade methods delegate to notification payload, download cleanup, and admin-message modules, including `getAdminMessages()`, `storeAdminMessage()`, `markAdminMessagesRead()`, and `clearAdminMessages()`.

## Storage Modules

### `modules/ai-secret-storage.ts`

Purpose: session-scoped AI API key storage.

Constants:

- `AI_API_KEY_SECRET_STORAGE_KEY = "aiApiKeySecret"`

Functions:

| Function                        | Purpose                   | Inputs         | Outputs | Side effects                      |
| ------------------------------- | ------------------------- | -------------- | ------- | --------------------------------- |
| `normalizeAiApiKey(value)`      | Trims key value.          | unknown        | string  | Pure.                             |
| `createAiSecretStorage(client)` | Creates AI secret module. | storage client | module  | Reads/writes/removes session key. |

### `modules/settings-storage.ts`

Purpose: settings normalization and persistence.

Functions:

| Function                                                                           | Purpose                                | Inputs                              | Outputs             | Side effects, errors, security                                                                  |
| ---------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `isObject()` / `normalizeBoolean()` / `normalizeText()` / `normalizeTrimmedText()` | Primitive normalizers.                 | unknown values                      | normalized values   | Pure helpers.                                                                                   |
| `normalizeNonNegativeNumber()`                                                     | Converts to non-negative number.       | unknown, fallback                   | number              | Pure helper.                                                                                    |
| `normalizePercentage()`                                                            | Converts to 0-100 percentage.          | unknown, fallback                   | number              | Pure helper.                                                                                    |
| `normalizeTimeOfDay()`                                                             | Validates `HH:mm` time.                | unknown, fallback                   | string              | Pure helper.                                                                                    |
| `normalizeAiExecutionMode(value)`                                                  | Normalizes bridge/direct.              | unknown                             | mode                | Defaults to bridge unless `WXT_ENABLE_UNSAFE_DIRECT_AI=true` and value is `direct`.             |
| `normalizeAiProvider(value)`                                                       | Normalizes provider.                   | unknown                             | provider            | Defaults to OpenAI.                                                                             |
| `normalizeNotificationMode(value)`                                                 | Normalizes notification mode.          | unknown                             | mode                | Defaults to auto.                                                                               |
| `normalizeMonitoredPlatforms(value)`                                               | Normalizes supported platform toggles. | unknown                             | platform record     | Preserves only Mostaql, Khamsat, Nafezly booleans.                                              |
| `normalizeSettings(value)`                                                         | Normalizes full settings object.       | unknown                             | `ExtensionSettings` | Normalizes AI chat URL, supported platforms, notification mode, and unsafe direct mode.         |
| `getLegacySettingsApiKey(value)`                                                   | Extracts legacy persistent API key.    | unknown                             | string              | Used for migration.                                                                             |
| `sanitizeSettingsForPersistentStorage(settings)`                                   | Clears persistent `aiApiKey`.          | settings                            | settings            | Privacy guard.                                                                                  |
| `normalizeProposalTemplate(value)`                                                 | Normalizes quick proposal template.    | unknown                             | string              | Defaults to template from schema.                                                               |
| `createSettingsStorage(client, aiSecrets?)`                                        | Creates settings module.               | storage client, optional AI secrets | module              | Migrates legacy API key, stores API key in session when available, persists sanitized settings. |

### `modules/job-storage.ts`

Purpose: job normalization and merge helpers.

Functions:

| Function                          | Purpose                     | Inputs                 | Outputs               | Side effects                                                                      |
| --------------------------------- | --------------------------- | ---------------------- | --------------------- | --------------------------------------------------------------------------------- |
| `isObject(value)`                 | Object guard.               | unknown                | boolean               | Internal.                                                                         |
| `normalizeText(value, fallback?)` | String normalizer.          | unknown                | string                | Exported helper.                                                                  |
| `normalizeOptionalText(value)`    | Optional string normalizer. | unknown                | string/undefined      | Exported helper.                                                                  |
| `cloneAttachments(value)`         | Copies attachments.         | attachments/undefined  | attachments/undefined | Avoids reference reuse.                                                           |
| `normalizeAttachments(value)`     | Validates attachment array. | unknown                | attachments/undefined | Requires string name/url.                                                         |
| `normalizeJob(value)`             | Normalizes one job.         | unknown                | job/null              | Requires id/title/url and supported/inferable platform.                           |
| `normalizeJobs(value)`            | Normalizes job array.       | unknown                | job array             | Filters invalid jobs.                                                             |
| `sortJobs(jobs)`                  | Sorts jobs.                 | jobs                   | jobs                  | Numeric IDs sort descending; otherwise URLs sort descending by locale comparison. |
| `mergeJobs(existing, incoming)`   | Merges and caps jobs.       | existing/incoming jobs | jobs                  | Deduplicates by job record key and caps recent jobs.                              |

### `modules/monitoring-storage.ts`

Purpose: seen/recent job and monitoring stats persistence.

Functions:

| Function                           | Purpose                               | Inputs         | Outputs          | Side effects                                                         |
| ---------------------------------- | ------------------------------------- | -------------- | ---------------- | -------------------------------------------------------------------- |
| `isObject(value)`                  | Object guard.                         | unknown        | boolean          | Internal.                                                            |
| `normalizeStats(value)`            | Normalizes stats.                     | unknown        | `ExtensionStats` | Defaults missing stats.                                              |
| `normalizeSeenJobs(value)`         | Normalizes seen IDs.                  | unknown        | string array     | Caps to `MAX_SEEN_JOBS`.                                             |
| `normalizeMonitoringFields(value)` | Normalizes seen/recent/stats fields.  | record         | state pick       | Uses job/stat normalizers.                                           |
| `resetDailyStats(stats)`           | Resets daily count when date changes. | stats          | stats            | Pure helper.                                                         |
| `createMonitoringStorage(client)`  | Creates monitoring storage module.    | storage client | module           | Writes seen jobs, recent jobs, stats, and runtime last-check fields. |

### `modules/runtime-storage.ts`

Purpose: runtime and SignalR state normalization/persistence.

Functions:

| Function                                                       | Purpose                                | Inputs         | Outputs           | Side effects                                  |
| -------------------------------------------------------------- | -------------------------------------- | -------------- | ----------------- | --------------------------------------------- |
| `isObject()` / `isSignalRStatus()` / `normalizeNullableText()` | Runtime validators.                    | unknown        | normalized values | Pure.                                         |
| `normalizeMonitoringErrors(value)`                             | Normalizes monitoring error map.       | unknown        | record            | Keeps message and failedAt strings.           |
| `normalizeReconnectAttempt(value)`                             | Normalizes attempt count.              | unknown        | number            | Non-negative integer.                         |
| `resolveLegacySignalRStatus(value)`                            | Resolves current/legacy status fields. | record         | status            | Compatibility path.                           |
| `createIdleSignalRState(input)`                                | Creates idle state.                    | partial input  | idle state        | Defaults backend URL.                         |
| `normalizeSignalRState(value)`                                 | Normalizes full SignalR state.         | unknown        | `SignalRState`    | Handles every status shape.                   |
| `normalizeRuntime(value)`                                      | Normalizes runtime state.              | unknown        | `RuntimeState`    | Normalizes SignalR and monitoring metadata.   |
| `createRuntimeStorage(client)`                                 | Creates runtime storage module.        | storage client | module            | Reads/writes runtime state and SignalR state. |

### `modules/proposal-state-storage.ts`

Purpose: pending bridge prompt and queued autofill storage.

Constants:

- `PENDING_BRIDGE_PROMPT_STORAGE_KEY = "pendingChatGptPrompt"`
- prompt TTL: 5 minutes
- max prompt length: 20,000 characters
- platform autofill keys for Mostaql, Khamsat, and Nafezly

Functions:

| Function                                            | Purpose                            | Inputs                      | Outputs                    | Side effects, errors, security                        |
| --------------------------------------------------- | ---------------------------------- | --------------------------- | -------------------------- | ----------------------------------------------------- |
| `resolveAutofillKey(platformId)`                    | Resolves autofill storage key.     | platform ID                 | key                        | Throws for unsupported autofill platform.             |
| `cloneAutofillDraft(draft)`                         | Copies draft.                      | draft                       | draft                      | Pure.                                                 |
| `createBridgePromptId()`                            | Creates prompt ID.                 | none                        | string                     | Uses `crypto.randomUUID()` or fallback.               |
| `normalizeBridgePromptText(value)`                  | Trims/caps prompt.                 | unknown                     | string/null                | Caps at 20,000 chars.                                 |
| `normalizePendingBridgePromptRecord(value, now?)`   | Validates pending bridge prompt.   | unknown, optional timestamp | record/null                | Rejects expired/invalid records.                      |
| `createPendingBridgePromptRecord(prompt, options?)` | Creates prompt record.             | prompt, chat URL/time       | record/null                | Sets target host and expiry.                          |
| `normalizeQueuedAutofill(value, platformId)`        | Normalizes autofill draft.         | unknown, platform           | draft/null                 | Accepts legacy `duration`/`timestamp` fields.         |
| `toStoredQueuedAutofill(draft)`                     | Serializes autofill draft.         | draft                       | record                     | Writes compatibility fields.                          |
| `normalizeProposalStateBackupPatch(value)`          | Builds backup import/export patch. | record                      | `{ setItems, removeKeys }` | Removes pending bridge prompt and invalid drafts.     |
| `createProposalStateStorage(client)`                | Creates proposal state module.     | storage client              | module                     | Reads/writes bridge prompt and queued autofill state. |

### `modules/download-cleanup-storage.ts`

Purpose: pending Blob URL cleanup storage.

Functions:

| Function                                 | Purpose                           | Inputs         | Outputs      | Side effects                                                 |
| ---------------------------------------- | --------------------------------- | -------------- | ------------ | ------------------------------------------------------------ |
| `isObject(value)`                        | Object guard.                     | unknown        | type guard   | Internal.                                                    |
| `normalizePendingDownloadCleanup(value)` | Validates cleanup record and TTL. | unknown        | cleanup/null | Drops expired/invalid records.                               |
| `getCleanupKey(downloadId)`              | Builds storage key.               | download ID    | string       | Prefixes with `download-cleanup:`.                           |
| `createDownloadCleanupStorage(client)`   | Creates cleanup storage module.   | storage client | module       | Stores, consumes, lists, and prunes pending cleanup records. |

### `modules/notification-payload-storage.ts`

Purpose: notification click payload storage.

Functions:

| Function                                    | Purpose                         | Inputs             | Outputs      | Side effects                                                       |
| ------------------------------------------- | ------------------------------- | ------------------ | ------------ | ------------------------------------------------------------------ |
| `isObject(value)`                           | Object guard.                   | unknown            | type guard   | Internal.                                                          |
| `normalizeStoredNotificationPayload(value)` | Validates notification payload. | unknown            | payload/null | Requires URL and valid createdAt.                                  |
| `isExpired(payload, nowMs)`                 | Checks 24-hour payload TTL.     | payload, timestamp | boolean      | Pure helper.                                                       |
| `createNotificationPayloadStorage(client)`  | Creates payload storage module. | storage client     | module       | Stores/removes/consumes/prunes payloads under `notification:<id>`. |

### `modules/admin-message-storage.ts`

Purpose: backend admin broadcast storage.

Constants:

- `ADMIN_MESSAGES_KEY = "adminMessages"`
- `MAX_ADMIN_MESSAGES = 20`

Functions:

| Function                            | Purpose                         | Inputs         | Outputs    | Side effects                                                   |
| ----------------------------------- | ------------------------------- | -------------- | ---------- | -------------------------------------------------------------- |
| `isAdminMessage(value)`             | Validates stored admin message. | unknown        | type guard | Requires ID, non-empty message, received timestamp, read flag. |
| `createAdminMessageStorage(client)` | Creates admin-message module.   | storage client | module     | Reads, deduplicates, caps, marks read, and clears messages.    |

Repository methods:

- `getAdminMessages()`
- `storeAdminMessage(msg)`
- `markAdminMessagesRead()`
- `clearAdminMessages()`

### `modules/prompt-storage.ts`

Purpose: prompt template storage.

Functions:

| Function                          | Purpose                        | Inputs         | Outputs      | Side effects                     |
| --------------------------------- | ------------------------------ | -------------- | ------------ | -------------------------------- |
| `isObject(value)`                 | Object guard.                  | unknown        | type guard   | Internal.                        |
| `normalizeText(value, fallback?)` | String normalizer.             | unknown        | string       | Internal.                        |
| `clonePrompts(value)`             | Copies prompt array.           | prompt array   | prompt array | Avoids reference reuse.          |
| `normalizePrompts(value)`         | Validates prompt array.        | unknown        | prompt array | Filters invalid prompt records.  |
| `createPromptStorage(client)`     | Creates prompt storage module. | storage client | module       | Reads/writes normalized prompts. |

### `modules/tracking-storage.ts`

Purpose: tracked project storage.

Functions:

| Function                          | Purpose                          | Inputs         | Outputs     | Side effects                               |
| --------------------------------- | -------------------------------- | -------------- | ----------- | ------------------------------------------ |
| `isObject(value)`                 | Object guard.                    | unknown        | type guard  | Internal.                                  |
| `cloneTrackedProjects(value)`     | Copies tracked project map.      | project map    | project map | Clones attachments and records.            |
| `normalizeTrackedProjects(value)` | Validates tracked project map.   | unknown        | project map | Drops entries without valid keys/projects. |
| `createTrackingStorage(client)`   | Creates tracking storage module. | storage client | module      | Reads/writes normalized tracked projects.  |

## `src/shared/storage/snapshot-state.ts`

Purpose: normalize full stored/imported snapshots.

Functions:

| Function                              | Purpose                             | Inputs  | Outputs       | Side effects                              |
| ------------------------------------- | ----------------------------------- | ------- | ------------- | ----------------------------------------- |
| `isRecord(value)`                     | Object guard.                       | unknown | type guard    | Internal.                                 |
| `normalizeStoredStateSnapshot(value)` | Normalizes raw snapshot.            | record  | `StoredState` | Uses module normalizers and defaults.     |
| `normalizeImportedState(value)`       | Normalizes imported backup payload. | unknown | `StoredState` | Non-object imports normalize to defaults. |

Related docs:

- [`../../06-storage-and-state.md`](../../06-storage-and-state.md)
- [`../../17-privacy-and-security-model.md`](../../17-privacy-and-security-model.md)
