# Browser Permissions And Privacy

Permissions are generated from `wxt.config.ts` and must remain synchronized with source behavior, README, and `PRIVACY.md`.

## Extension Permissions

| Permission      | Chrome | Firefox | Reason                                                                              |
| --------------- | ------ | ------- | ----------------------------------------------------------------------------------- |
| `alarms`        | Yes    | Yes     | Polling, SignalR health checks, lease rotation, reconnect scheduling.               |
| `downloads`     | Yes    | Yes     | Generated ZIP exports and Blob URL cleanup.                                         |
| `notifications` | Yes    | Yes     | Job and test notifications.                                                         |
| `storage`       | Yes    | Yes     | Settings, jobs, prompts, runtime, tracking, bridge/autofill state, cleanup records. |
| `offscreen`     | Yes    | No      | Chrome-only audio, DOMParser, and Blob URL tasks.                                   |

## Host Permissions

| Host                                          | Reason                                                            |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `https://mostaql.com/*`                       | Monitoring, content UI, autofill, export, dashboard bid requests. |
| `https://khamsat.com/*`                       | Monitoring, parser, content UI, autofill.                         |
| `https://nafezly.com/*`                       | Monitoring, parser, content UI, autofill.                         |
| `https://chatgpt.com/*`                       | Bridge content script.                                            |
| `https://chat.openai.com/*`                   | Bridge content script for legacy ChatGPT host.                    |
| `https://rasid.runasp.net/*`             | Default SignalR backend.                                          |
| `https://api.openai.com/*`                    | OpenAI direct proposal generation.                                |
| `https://generativelanguage.googleapis.com/*` | Gemini direct proposal generation.                                |
| `https://api.anthropic.com/*`                 | Claude direct proposal generation.                                |

## Firefox Settings

Generated Firefox manifest settings include:

- Gecko ID `rasid@mostaql-notifier`
- strict minimum Firefox version `140.0`
- required data collection permission `websiteContent`
- Gecko Android strict minimum version `142.0`

## Data Sent Over Network

| Destination                 | Trigger                                  | Payload type                                                                              |
| --------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Mostaql/Khamsat/Nafezly     | Monitoring polling                       | `GET` HTML fetches with no request body and `credentials: "omit"`.                        |
| Mostaql detail/export paths | User-visible export and content features | `GET` requests; selected export attachment fetches use `credentials: "include"`.          |
| SignalR backend             | Realtime mode                            | SignalR connection, receives job batches, no custom hub method sending prompts/proposals. |
| OpenAI/Gemini/Claude        | Direct AI mode only                      | Prompt text and provider request body.                                                    |
| ChatGPT                     | Bridge mode after opening ChatGPT        | Prompt is inserted into page DOM by content script for manual user review.                |

See [`../PRIVACY.md`](../PRIVACY.md) for a fuller disclosure.

## Store-Review Constraints

- Permissions should be justified by shipped code paths.
- Unsupported platform permissions must not be included.
- Direct AI host permissions are part of shipped direct mode.
- Bridge host permissions are part of shipped bridge mode.
- Generated builds must be inspected before submission.
- Source packages should exclude generated build output, dependency folders, private backend settings, and local artifacts.

Related docs:

- [`16-store-review-notes.md`](16-store-review-notes.md)
- [`17-privacy-and-security-model.md`](17-privacy-and-security-model.md)
