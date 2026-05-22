# Runtime Messaging

Rasid uses validated message contracts for popup/dashboard/content/background/offscreen communication.

## Background Messages

Defined in `src/app/background/background-messages.ts`.

| Action              | Request fields          | Response                       |
| ------------------- | ----------------------- | ------------------------------ |
| `checkNow`          | action only             | `JobBatchResult`               |
| `testNotification`  | action only             | `{ success: true }`            |
| `testSound`         | action only             | `{ success: true }`            |
| `updateAlarm`       | optional `interval`     | `{ success: true }`            |
| `reconnectSignalR`  | action only             | `{ success: true }`            |
| `disconnectSignalR` | action only             | `{ success: true }`            |
| `debugFetch`        | action only             | `{ success, length?, error? }` |
| `generateProposal`  | `templateId`, `context` | `GenerateProposalResponse`     |
| `downloadZip`       | `filename`, `files`     | `ZipDownloadResult`            |

## Background Message Security

`registerBackgroundRuntimeMessageBus()` checks:

- sender extension ID matches the current extension when present
- sender URL is either an extension page or an allowed HTTPS content-script host
- action exists in `BACKGROUND_ACTIONS`
- request payload passes the action-specific validator
- handler output passes the action-specific response validator before callers accept it

Trusted content-script hosts are:

- `chat.openai.com`
- `chatgpt.com`
- `khamsat.com`
- `mostaql.com`
- `nafezly.com`

## Proposal Message Constraints

`generateProposal` payload validation enforces:

- template ID length
- title and description presence and size limits
- optional string bounds
- platform URL HTTPS host allowlist
- tag count and field limits
- attachment count and supported URL validation

Allowed AI context URL hosts are `khamsat.com`, `mostaql.com`, and `nafezly.com`.

## Offscreen Messages

Defined in `src/features/offscreen/manager.ts`.

| Task                            | Payload                    | Result                                       |
| ------------------------------- | -------------------------- | -------------------------------------------- | ----- |
| `audio.play-notification`       | empty object               | `{ success: true }`                          |
| `downloads.create-zip-url`      | `filename`, up to 80 files | `{ success, filename?, objectUrl?, error? }` |
| `downloads.revoke-object-url`   | `objectUrl`                | `{ success: true }`                          |
| `monitoring.parse-listing-html` | `platformId`, `html`       | `JobRecord[]`                                |
| `monitoring.parse-project-html` | `platformId`, `html`       | `Partial<JobRecord>                          | null` |

Offscreen envelopes include:

- `channel: "rasid:offscreen"`
- `source: "background"`
- `requestId`
- `task`
- `payload`

## Offscreen Sender Checks

The offscreen document accepts only messages that:

- match the offscreen protocol envelope
- come from the same extension ID when present
- are not associated with a tab sender

## Error Behavior

| Failure                     | Behavior                                                             |
| --------------------------- | -------------------------------------------------------------------- |
| Unknown background action   | Message bus ignores it.                                              |
| Invalid background payload  | Sender receives `{ ok: false, error: "Invalid message payload." }`.  |
| Untrusted background sender | Sender receives `{ ok: false, error: "Untrusted message sender." }`. |
| Invalid background response | Caller throws `Invalid background response for <action>.`            |
| Invalid offscreen response  | Caller throws `Invalid offscreen response for <task>.`               |
| Offscreen task failure      | Offscreen transport returns `{ ok: false, error }`.                  |

Related docs:

- [`reference/source/app-background.md`](reference/source/app-background.md)
- [`reference/source/features-realtime-notifications-downloads.md`](reference/source/features-realtime-notifications-downloads.md)
