# Browser Permissions And Privacy

Permissions are generated from `wxt.config.ts` and must remain synchronized with source behavior, README, and `PRIVACY.md`.

## Extension Permissions

| Permission      | Chrome | Firefox | Reason                                                                              |
| --------------- | ------ | ------- | ----------------------------------------------------------------------------------- |
| `alarms`        | Yes    | Yes     | Polling, SignalR health checks, lease rotation, reconnect scheduling.               |
| `downloads`     | Yes    | Yes     | Generated ZIP exports and Blob URL cleanup.                                         |
| `notifications` | Yes    | Yes     | Job and test notifications.                                                         |
| `scripting`     | Yes    | Yes     | On-demand ChatGPT bridge injection after optional host permission approval.         |
| `storage`       | Yes    | Yes     | Settings, jobs, prompts, runtime, tracking, bridge/autofill state, cleanup records. |
| `offscreen`     | Yes    | No      | Chrome-only audio, DOMParser, and Blob URL tasks.                                   |

## Required Host Permissions

| Host                         | Reason                                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| `https://mostaql.com/*`      | Monitoring, content UI, autofill, export, dashboard bid requests. |
| `https://khamsat.com/*`      | Monitoring, parser, content UI, autofill.                         |
| `https://nafezly.com/*`      | Monitoring, parser, content UI, autofill.                         |
| `https://rasid.runasp.net/*` | Default SignalR backend.                                          |
| `http://localhost/*`         | Local extension/backend development.                              |

## Optional Host Permissions

| Host                                          | Reason                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `https://chatgpt.com/*`                       | On-demand ChatGPT bridge script injection after user approval.                     |
| `https://chat.openai.com/*`                   | On-demand bridge script injection for the legacy ChatGPT host after user approval. |
| `https://api.openai.com/*`                    | Unsafe side builds only: direct OpenAI proposal generation after user approval.    |
| `https://generativelanguage.googleapis.com/*` | Unsafe side builds only: direct Gemini proposal generation after user approval.    |
| `https://api.anthropic.com/*`                 | Unsafe side builds only: direct Claude proposal generation after user approval.    |

ChatGPT optional hosts are emitted in normal builds. Provider optional hosts are emitted only when `WXT_ENABLE_UNSAFE_DIRECT_AI=true`.

## Firefox Settings

Generated Firefox manifest settings include:

- Gecko ID `frelancia@mostaql-notifier`
- strict minimum Firefox version `140.0`
- required data collection permission `websiteContent`
- Gecko Android strict minimum version `142.0`

## Data Sent Over Network

| Destination                 | Trigger                                  | Payload type                                                                                                          |
| --------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Mostaql/Khamsat/Nafezly     | Monitoring polling                       | `GET` HTML fetches with no request body and `credentials: "omit"`.                                                    |
| Mostaql detail/export paths | User-visible export and content features | `GET` requests; selected export attachment fetches use `credentials: "include"`.                                      |
| SignalR backend             | Realtime mode                            | SignalR connection, receives job batches and admin messages, no custom hub method sending prompts/proposals.          |
| OpenAI/Gemini/Claude        | Unsafe direct AI side builds only        | Prompt text and provider request body after optional provider host permission is granted.                             |
| ChatGPT                     | Bridge mode after opening ChatGPT        | Prompt is inserted into page DOM by injected script for manual user review after optional host permission is granted. |

See [`../PRIVACY.md`](../PRIVACY.md) for a fuller disclosure.

## Store-Review Constraints

- Permissions should be justified by shipped code paths.
- Unsupported platform permissions must not be included.
- Direct AI provider hosts must appear only in unsafe direct-AI side builds.
- Bridge host permissions are optional and requested when the user opens the ChatGPT bridge.
- Generated builds must be inspected before submission.
- Source packages should exclude generated build output, dependency folders, private backend settings, and local artifacts.

Related docs:

- [`16-store-review-notes.md`](16-store-review-notes.md)
- [`17-privacy-and-security-model.md`](17-privacy-and-security-model.md)
