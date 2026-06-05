# Source Reference: Features - Monitoring

Runtime context: background monitoring, popup/dashboard repositories, and platform content tracking.

## `src/features/monitoring/fetch-platform-html.ts`

Purpose: safe marketplace HTML fetching and platform parser invocation.

Important constant:

- `MONITORING_FETCH_TIMEOUT_MS = 15_000`

Functions:

| Function                                       | Purpose                                                             | Inputs        | Outputs                        | Side effects, errors, security                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------- | ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `sanitizeFetchError(error)`                    | Converts fetch errors into bounded messages.                        | unknown error | string                         | Hides raw `TypeError` details as `Network request failed.`                                                                           |
| `createFetchTimeoutSignal()`                   | Creates abort signal for bounded HTML fetches.                      | none          | signal/cleanup                 | Uses `AbortSignal.timeout()` when available or manual `AbortController`.                                                             |
| `fetchHtml(url)`                               | Fetches HTML with no credentials, timeout, and challenge detection. | URL string    | success/error result           | Uses `GET`, `credentials: "omit"`, `cache: "no-store"`, `referrerPolicy: "no-referrer"`, 15s timeout, and anti-bot marker detection. |
| `fetchPlatformFeedJobsResult(monitoring, url)` | Fetches cache-busted feed and parses listing HTML.                  | adapter, URL  | success/error result           | Appends `_cb=<timestamp>`; parser may run in offscreen/local task.                                                                   |
| `hydratePlatformJob(monitoring, job)`          | Fetches detail page and merges parsed detail fields.                | adapter, job  | `JobRecord`                    | Returns original job on fetch error.                                                                                                 |
| `debugFetchMonitoringSource(monitoring)`       | Tests one platform probe URL.                                       | adapter       | `{ success, length?, error? }` | Used by popup diagnostics.                                                                                                           |
| `debugFetchMonitoringSources(monitoring)`      | Tests enabled platform probes.                                      | adapter array | combined diagnostics           | Returns failure when no platforms are enabled.                                                                                       |

## `src/features/monitoring/run-polling-cycle.ts`

Purpose: orchestrates one background polling cycle.

Important constants:

- `KHAMSAT_PUBLISH_FRESHNESS_HOURS = 48`

Functions:

| Function                             | Purpose                                                                                         | Inputs                                                       | Outputs                   | Side effects, errors, security                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `classifyKhamsatFreshness(job, now)` | Classifies hydrated Khamsat request as fresh, stale, or retry.                                  | job, date                                                    | freshness label           | Uses `parseJobPostedAt()` and the 48-hour freshness window.                                                                   |
| `runPollingCycle(options)`           | Fetches feeds, parses jobs, hydrates new records, filters, stores, and publishes notifications. | storage, notifier, reason, adapters, optional audio callback | `Promise<JobBatchResult>` | Writes runtime state, seen/recent jobs, stats; respects disabled/no-platform states; records monitoring errors by adapter ID. |

## `src/features/monitoring/process-realtime-job-batch.ts`

Purpose: normalizes and processes jobs received from SignalR.

Functions:

| Function                           | Purpose                                             | Inputs                                  | Outputs                   | Side effects, errors, security                                                                              |
| ---------------------------------- | --------------------------------------------------- | --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `processRealtimeJobBatch(options)` | Converts realtime jobs into stored/published batch. | jobs, storage, notifier, optional audio | `Promise<JobBatchResult>` | Drops invalid/unsupported jobs, checks platform toggles and filters, ingests jobs, publishes notifications. |

## `src/features/monitoring/job-batch-publisher.ts`

Purpose: common notification publication path for polling and SignalR.

Types:

- `JobBatchSource`
- `JobBatchNoopReason`
- `JobBatchFailedReason`
- `JobNotifier`
- `JobBatchResult`

Functions:

| Function                                                                     | Purpose                              | Inputs                                                                      | Outputs                   | Side effects, errors, security                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `createNoopJobBatchResult(source, totalChecked, reason)`                     | Builds no-op batch result.           | source, count, reason                                                       | `JobBatchResult`          | Pure.                                                                               |
| `createFailedJobBatchResult(source, totalChecked, reason, monitoringErrors)` | Builds failed fetch batch result.    | source, count, reason, errors                                               | `JobBatchResult`          | Pure; carries per-platform errors.                                                  |
| `publishJobBatch(options)`                                                   | Publishes or suppresses a job batch. | source, jobs, count, settings, notification state, notifier, optional audio | `Promise<JobBatchResult>` | Suppresses during quiet hours, calls notifier and optional audio only when enabled. |

## `src/features/monitoring/job-filters.ts`

Purpose: filtering rules for monitored jobs.

Exports:

- `JobFilterFailure`
- `JobFilterRule`
- `jobFilterRules`
- `JobFilterDiagnostic`
- `evaluateJobFilters()`
- `applyJobFilters()`
- `isQuietHour()`

Functions/rules:

| Function/rule                            | Purpose                                | Inputs                       | Outputs           | Side effects, errors, security         |
| ---------------------------------------- | -------------------------------------- | ---------------------------- | ----------------- | -------------------------------------- |
| `parseTerms(value)`                      | Splits comma-separated keyword terms.  | string                       | string array      | Lowercases and trims.                  |
| `minBudgetRule`                          | Rejects jobs below minimum budget.     | job/filter context           | failure or `null` | Uses parsed budget ceiling.            |
| `minHiringRateRule`                      | Rejects low hiring-rate clients.       | context                      | failure or `null` | Uses parsed percentage.                |
| `includeKeywordRule`                     | Requires at least one include term.    | context                      | failure or `null` | Searches title and description.        |
| `excludeKeywordRule`                     | Rejects jobs containing excluded term. | context                      | failure or `null` | Searches title and description.        |
| `maxDurationRule`                        | Rejects jobs exceeding max duration.   | context                      | failure or `null` | Uses parsed duration days.             |
| `minClientAgeRule`                       | Rejects clients below age threshold.   | context                      | failure or `null` | Uses Arabic date age parser.           |
| `evaluateJobFilters(job, settings, now)` | Runs all rules.                        | job, settings, optional date | diagnostic        | Pure.                                  |
| `applyJobFilters(job, settings, now)`    | Boolean pass/fail helper.              | job, settings, optional date | boolean           | Pure.                                  |
| `isQuietHour(settings, now)`             | Checks quiet-hours window.             | settings, optional date      | boolean           | Handles same-day and overnight ranges. |

## `src/features/monitoring/job-records.ts`

Purpose: normalize unknown realtime payloads into supported `JobRecord` objects.

Functions:

| Function                    | Purpose                              | Inputs  | Outputs               | Side effects, errors, security                              |
| --------------------------- | ------------------------------------ | ------- | --------------------- | ----------------------------------------------------------- |
| `normalizeJobRecord(value)` | Validates id/title/url and platform. | unknown | `JobRecord` or `null` | Drops records with unsupported or uninferable platform IDs. |

## `src/features/monitoring/repository.ts`

Purpose: monitoring state repository for popup/dashboard.

Exports:

- `MonitoringOverview`
- `MonitoringRepository`
- `createMonitoringRepository()`

Functions:

| Function                              | Purpose                                    | Inputs         | Outputs                | Side effects, errors, security                                   |
| ------------------------------------- | ------------------------------------------ | -------------- | ---------------------- | ---------------------------------------------------------------- |
| `cloneRuntimeState(runtime)`          | Deep-ish clones runtime state.             | runtime state  | runtime state          | Copies nested SignalR and errors object.                         |
| `createMonitoringRepository(storage)` | Builds repository over `ExtensionStorage`. | storage facade | `MonitoringRepository` | Reads snapshot, notification state; updates notification toggle. |

Repository methods:

- `getOverview()`
- `getNotificationsEnabled()`
- `setNotificationsEnabled(enabled)`

## `src/features/monitoring/tracking-repository.ts`

Purpose: tracked project repository used by content scripts and dashboard.

Exports:

- `TrackingRepository`
- `createTrackingRepository()`

Functions:

| Function                                                            | Purpose                                      | Inputs                    | Outputs              | Side effects, errors, security                                               |
| ------------------------------------------------------------------- | -------------------------------------------- | ------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `toTrackedProjectRecord(storageKey, project)`                       | Converts stored project into keyed record.   | storage key, project      | record or `null`     | Parses `platform:id` keys and falls back to project ID/platform where valid. |
| `toStoredTrackedProject(project)`                                   | Converts view record to stored project.      | tracked record            | stored project       | Preserves metadata.                                                          |
| `findTrackedProjectMatches(trackedProjects, projectId, platformId)` | Finds existing records for project/platform. | project map, ID, platform | matches              | Handles legacy/unqualified keys.                                             |
| `createTrackingRepository(storage)`                                 | Builds tracking repository.                  | storage facade            | `TrackingRepository` | Reads/writes tracked project map.                                            |

Repository methods:

- `list()`
- `isTracked(projectId, platformId)`
- `toggle(project)`
