# Storage And State

Rasid stores extension state through browser storage wrappers and storage modules.

## Storage Areas

| Area                                   | Current keys                                                                                                                       | Use                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `browser.storage.local`                | `settings`, `seenJobs`, `recentJobs`, `stats`, `trackedProjects`, `prompts`, `proposalTemplate`, `notificationsEnabled`, `runtime` | Persistent extension state.                                  |
| `browser.storage.local` auxiliary keys | `pendingChatGptPrompt`, `*_pending_autofill`, `notification:<id>`, `download-cleanup:<id>`                                         | Bridge, autofill, click payload, and Blob URL cleanup state. |
| `browser.storage.session`              | `aiApiKeySecret`                                                                                                                   | Session-scoped direct-mode AI API key.                       |

`restrictBrowserSessionStorageToTrustedContexts()` tries to set session storage access to `TRUSTED_CONTEXTS`.

## Persistent Snapshot

`StoredState` is defined in `src/shared/storage/schema.ts`.

| Field                  | Normalizer                                           |
| ---------------------- | ---------------------------------------------------- |
| `settings`             | `normalizeSettings()`                                |
| `seenJobs`             | `normalizeSeenJobs()`                                |
| `recentJobs`           | `normalizeJobs()`                                    |
| `stats`                | `normalizeStats()`                                   |
| `trackedProjects`      | `normalizeTrackedProjects()`                         |
| `prompts`              | `normalizePrompts()`                                 |
| `proposalTemplate`     | `normalizeProposalTemplate()`                        |
| `notificationsEnabled` | boolean fallback in `normalizeStoredStateSnapshot()` |
| `runtime`              | `normalizeRuntime()`                                 |

## Settings Behavior

Important settings rules:

- polling interval is clamped from 1 to 30 minutes
- `monitoredPlatforms` only preserves supported monitoring IDs: `mostaql`, `khamsat`, `nafezly`
- `notificationMode` is `auto`, `signalr`, or `polling`
- `aiExecutionMode` is `bridge` or `direct`
- `aiProvider` is `openai`, `gemini`, or `claude`
- `signalrServerUrl` is normalized to an empty stored string in settings; runtime resolves the default backend URL
- `aiChatUrl` is normalized to HTTPS `chatgpt.com` or `chat.openai.com`
- persistent `aiApiKey` is sanitized to an empty string

## Backup Export

`createBackupRepository().exportAll()`:

- reads `SNAPSHOT_KEYS` plus proposal state keys
- adds `schemaVersion: 1`
- adds `exportedAt`
- normalizes the stored snapshot
- includes valid queued autofill drafts
- omits pending bridge prompt state
- does not export session AI secrets

## Backup Import

`createBackupRepository().importAll()`:

- requires an object payload
- rejects unsupported `schemaVersion`
- rejects objects with no recognized backup content
- normalizes imported state
- removes stale pending bridge prompts
- removes invalid queued autofill keys
- writes normalized snapshot and valid autofill drafts
- clears the current session AI key when an AI secret storage module is supplied

The dashboard validates and previews backup imports before calling `importAll()`.

## Notification Payloads

Notification payloads are stored under `notification:<notificationId>` with a 24-hour TTL. Click handling consumes the payload and opens only normalized supported HTTPS platform URLs.

## Download Cleanup State

Pending Blob URL cleanup records are stored under `download-cleanup:<downloadId>` with a 30-minute TTL. The download cleanup service reconciles records on startup and when browser download state changes to complete or interrupted.

## Security And Privacy Notes

- Browser storage is not encrypted by this codebase.
- Direct AI API keys are not included in default backups.
- Bridge prompts are short-lived, target-host constrained, and cleared after use or failure.
- Imported legacy AI keys are not persisted into `settings`.

Related docs:

- [`17-privacy-and-security-model.md`](17-privacy-and-security-model.md)
- [`reference/source/shared-browser-storage.md`](reference/source/shared-browser-storage.md)
