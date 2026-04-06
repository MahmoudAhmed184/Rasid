# Privacy Disclosure

## Scope

This disclosure is based on the code in this repository as provided. It describes what the extension stores locally and what it sends over the network.

## Local Storage

The extension stores its state in `browser.storage.local`.

### Persistent keys

- `settings`
- `seenJobs`
- `recentJobs`
- `stats`
- `trackedProjects`
- `prompts`
- `proposalTemplate`
- `notificationsEnabled`
- `runtime`

### Temporary or auxiliary keys

- `pendingChatGptPrompt`
- `mostaql_pending_autofill`
- `notification:<notificationId>`

### AI API keys

AI API keys are stored locally in:

- `settings.aiApiKey`

The code stores that value in `browser.storage.local`. It is not encrypted by application code in this repository.

Important consequence: the dashboard backup export reads the full local storage snapshot with `browser.storage.local.get(null)`. If the user exports a backup, that JSON backup will include `settings.aiApiKey`.

## What Is Sent To Mostaql

The extension makes several requests to `https://mostaql.com/*`.

### Background polling requests

`src/core/jobs.ts` sends `GET` requests to:

- `https://mostaql.com/projects?sort=latest`
- `https://mostaql.com/projects?category=development&sort=latest`
- `https://mostaql.com/projects?category=ai-machine-learning&sort=latest`

Each request adds a `_cb=<timestamp>` cache-buster.

Request properties:

- method: `GET`
- body: none
- credentials: `omit`
- headers:
  - `Accept`
  - `Accept-Language`
  - `Cache-Control`
  - `Pragma`

### Background project hydration requests

When polling finds a new job, the background fetches the project detail page URL and parses it locally.

Request properties:

- method: `GET`
- body: none
- credentials: `omit`

### Popup diagnostics request

The popup’s “Diagnostics” action triggers the same background HTML fetch path against the Mostaql listing page.

### Bid tracker and analytics requests

The dashboard and Mostaql homepage analytics code request:

- `https://mostaql.com/dashboard/bids?page=<n>&sort=latest`
- `https://mostaql.com/`

Request properties:

- method: `GET`
- body: none
- credentials: `include`

These requests can therefore include the user’s Mostaql cookies if the browser currently has an authenticated Mostaql session.

### Deep project scraping from the content script

`src/ui/mostaql/data.mjs` may fetch a Mostaql project page URL again in order to extract richer project data for export.

Request properties:

- method: `GET`
- body: none

### Attachment and media export downloads

When the user explicitly exports a project or chat, the background may download attachment URLs from Mostaql into a ZIP archive.

Request properties:

- method: `GET`
- body: none
- credentials: `include`

### Mostaql payload summary

The extension does not send a custom POST or PUT payload to Mostaql in the current codebase.

What it sends to Mostaql is limited to:

- standard `GET` requests
- standard request headers
- browser cookies on the request paths that use `credentials: 'include'`

## What Is Sent To The Custom SignalR Server

The extension connects to:

- `settings.signalrServerUrl`, or
- `https://frelancia.runasp.net/jobNotificationHub`

This connection is created by `@microsoft/signalr` in `src/core/signalr.ts`.

Configured transports:

- WebSockets
- Server-Sent Events
- Long Polling

Application-level behavior in this repository:

- the extension opens the SignalR connection
- the extension listens for the `NewJobsDetected` event
- the extension receives job payloads from the hub

Custom outbound payloads to the SignalR server: Not implemented in current codebase.

The repository code does not call any hub method that sends Mostaql project details, prompts, or user-written proposals back to the custom server. The only outbound traffic handled by the app layer is the connection itself and the SignalR protocol handshake managed by the SignalR library.

## What Is Sent To AI Providers

AI provider requests are sent only in `settings.aiExecutionMode === 'direct'`.

The prompt content is built from the Mostaql project page and may include these fields, depending on the active prompt template:

- title
- description
- url
- tags
- client name
- client type
- budget
- duration
- publish date
- project ID
- project status
- category
- hiring rate
- open projects
- underway projects
- client joined date
- communications count

### OpenAI

Endpoint:

- `POST https://api.openai.com/v1/responses`

Headers:

- `authorization: Bearer <apiKey>`
- `content-type: application/json`

JSON body:

- `model`
- `instructions`
- `input`
- optional `temperature`
- optional `max_output_tokens`
- optional `metadata`

### Gemini

Endpoint:

- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`

Headers:

- `content-type: application/json`

JSON body:

- `systemInstruction`
- `contents`
- optional `generationConfig`

### Claude

Endpoint:

- `POST https://api.anthropic.com/v1/messages`

Headers:

- `x-api-key: <apiKey>`
- `anthropic-version: 2023-06-01`
- `anthropic-dangerous-direct-browser-access: true`
- `content-type: application/json`

JSON body:

- `model`
- `system`
- `messages`
- `temperature`
- `max_tokens`

## Bridge Mode And AI Chat Websites

When `settings.aiExecutionMode === 'bridge'`, the extension does not call an AI API directly.

Instead it:

1. Renders the proposal prompt locally.
2. Stores that text in `browser.storage.local.pendingChatGptPrompt`.
3. Opens `settings.aiChatUrl` or `https://chatgpt.com/`.
4. Injects the prompt into the DOM on:
   - `https://chatgpt.com/*`
   - `https://chat.openai.com/*`

Automatic message submission to the AI website: Not implemented in current codebase.

The extension does not click the send button. Any actual submission from the website to the AI provider happens only if the user manually sends the message.

## Additional Network Requests

The dashboard “contributors” tab fetches:

- `https://api.github.com/repos/Elaraby218/Frelancia/contributors`

Request properties:

- method: `GET`
- body: none

This request does not send project data, prompts, or API keys.

## What The Extension Does Not Send

Based on the repository code:

- It does not send stored API keys to Mostaql.
- It does not send Mostaql project content to the custom SignalR server.
- It does not auto-submit prompts to ChatGPT/OpenAI web chat pages.
- It does not define any custom analytics or telemetry endpoint beyond the hosts listed above.

## User Control

- Monitoring can be disabled with `settings.systemEnabled`.
- SignalR can be avoided by setting `settings.notificationMode = polling`.
- Notifications can be turned off with `notificationsEnabled = false`.
- All locally stored data, including prompts and API keys, lives in extension local storage and can be removed by clearing the extension’s stored data.
