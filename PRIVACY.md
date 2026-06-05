# Privacy Disclosure

## Scope

This disclosure is based on the code in this repository as provided. It describes what the extension stores locally and what it sends over the network.

## Local Storage

The extension stores operational state in `browser.storage.local`. Direct-mode AI API keys are stored separately in `browser.storage.session` for trusted extension contexts while the browser session is active.

### Persistent snapshot keys

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

- `pendingChatGptPrompt` as a short-lived one-shot record
- `mostaql_pending_autofill`
- `khamsat_pending_autofill`
- `nafezly_pending_autofill`
- `notification:<notificationId>`
- `download-cleanup:<downloadId>`
- `adminMessages`

### AI API keys

AI API keys are stored in browser session storage under the extension-managed secret key:

- `aiApiKeySecret`

The persistent `settings` object stores `settings.aiApiKey` as an empty string. Legacy keys found in persistent settings are migrated to session storage and removed from the persistent settings snapshot. The repository does not encrypt the session value before writing it to browser storage, and the key may need to be re-entered after a browser session restart.

### Backup exports

The backup export path normalizes and exports the stored settings snapshot plus non-secret proposal-state keys. Default backups do not include `settings.aiApiKey`, `aiApiKeySecret`, or `pendingChatGptPrompt`.

Importing a backup does not import API keys or stale ChatGPT bridge prompts. Import clears the current session API key so the user must explicitly enter any direct-mode key again.

Admin messages received from the backend are auxiliary state, not part of the persistent backup snapshot. The extension keeps at most 20 `adminMessages` records, deduplicates by message ID, marks them read when dismissed in the popup, and does not include them in backup exports.

## What Is Sent To Mostaql

The extension makes several requests to `https://mostaql.com/*`.

### Background polling requests

Background monitoring is orchestrated by:

- `src/features/monitoring/run-polling-cycle.ts`
- `src/features/monitoring/fetch-platform-html.ts`
- `src/platforms/mostaql/monitoring.ts`

The current Mostaql feed set is:

- `https://mostaql.com/projects?sort=latest`
- `https://mostaql.com/projects?category=development&sort=latest`
- `https://mostaql.com/projects?category=ai-machine-learning&sort=latest`

Each polling request appends a `_cb=<timestamp>` cache-buster.

Request properties:

- method: `GET`
- body: none
- credentials: `omit`
- cache: `no-store`
- referrerPolicy: `no-referrer`
- timeout: 15 seconds
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
- timeout: 15 seconds

### Popup diagnostics request

The popup diagnostics action triggers the same background HTML fetch path against the enabled monitoring adapters, including Mostaql when that platform is enabled.

### Bid tracker and analytics requests

The dashboard bid tracker and the Mostaql homepage analytics code request:

- `https://mostaql.com/dashboard/bids?page=<n>&sort=latest`
- `https://mostaql.com/`

Request properties:

- method: `GET`
- body: none
- credentials: `include`

These requests can include the user’s Mostaql cookies if the browser has an authenticated Mostaql session.

### Deep project scraping from the content script

`src/platforms/mostaql/content/data.ts` may fetch a Mostaql project page URL again in order to extract richer project data for export and proposal context building.

Request properties:

- method: `GET`
- body: none
- credentials: browser default for same-origin fetches

### Attachment and media export downloads

When the user explicitly exports a project or chat, the background may download attachment URLs from Mostaql into a ZIP archive.

Request properties:

- method: `GET`
- body: none
- credentials: `include`

### Mostaql payload summary

The extension does not send custom POST or PUT application payloads to Mostaql in the current codebase.

What it sends to Mostaql is limited to:

- standard `GET` requests
- standard request headers
- browser cookies on request paths that use `credentials: 'include'` or same-origin defaults

## What Is Sent To Khamsat

The extension makes monitoring requests to `https://khamsat.com/*`.

### Background polling requests

Khamsat monitoring is implemented through:

- `src/features/monitoring/run-polling-cycle.ts`
- `src/features/monitoring/fetch-platform-html.ts`
- `src/platforms/khamsat/monitoring.ts`

The current Khamsat monitoring feed is:

- `https://khamsat.com/community/requests`

Request properties:

- method: `GET`
- body: none
- credentials: `omit`
- cache: `no-store`
- referrerPolicy: `no-referrer`
- timeout: 15 seconds

### Project/detail hydration requests

When polling finds a new Khamsat request, the background may fetch the request URL and parse it locally for richer metadata.

Request properties:

- method: `GET`
- body: none
- credentials: `omit`
- timeout: 15 seconds

Khamsat detail hydration is also used to classify request freshness. Requests with a parsed publish date outside the configured 48-hour freshness window are remembered as seen without being published as new notifications.

### Page-side content features

The Khamsat content script reads the currently open request page DOM for tracking and AI reply generation.

Additional Khamsat network requests are not initiated from the content script for the basic page-side panel workflow in the current codebase.

## What Is Sent To Nafezly

The extension makes monitoring requests to `https://nafezly.com/*`.

### Background polling requests

Nafezly monitoring is implemented through:

- `src/features/monitoring/run-polling-cycle.ts`
- `src/features/monitoring/fetch-platform-html.ts`
- `src/platforms/nafezly/monitoring.ts`

The current Nafezly monitoring feed is:

- `https://nafezly.com/projects`

Request properties:

- method: `GET`
- body: none
- credentials: `omit`
- cache: `no-store`
- referrerPolicy: `no-referrer`
- timeout: 15 seconds

### Project/detail hydration requests

When polling finds a new Nafezly project, the background may fetch the project URL and parse it locally for richer metadata.

Request properties:

- method: `GET`
- body: none
- credentials: `omit`
- timeout: 15 seconds

### Page-side content features

The Nafezly content script reads the currently open project page DOM for tracking, AI proposal generation, and optional proposal autofill.

The current Nafezly content workflow does not add custom platform-origin network requests beyond the page the user already opened.

## What Is Sent To The SignalR Server

The extension connects to:

- `https://rasid.runasp.net/jobNotificationHub`

The packaged extension uses only this backend origin. Current settings do not persist an alternate SignalR URL.

This connection is managed by:

- `src/features/realtime/signalr-manager.ts`
- `src/features/realtime/signalr-reducer.ts`
- `src/features/realtime/signalr-effects.ts`

Configured transports:

- WebSockets
- Server-Sent Events
- Long Polling

Application-level behavior in this repository:

- the extension opens the SignalR connection
- the extension listens for the `NewJobsDetected` event
- the extension listens for the `AdminMessageReceived` event
- the extension receives job payloads from the hub
- the extension receives admin-message payloads containing `id`, `message`, `createdAt`, and optional `url`

Custom outbound hub method calls that send project details, prompts, or proposals back to the SignalR server are not implemented in the repository code.

Received admin messages are stored locally under `adminMessages`, displayed in the popup until marked read, and may create a browser notification. If an admin message includes a URL, notification click handling opens it only when it normalizes to an allowed HTTPS marketplace host.

## What Is Sent To AI Providers

AI provider requests are sent only in unsafe side builds when all of these are true:

- the extension was built with `WXT_ENABLE_UNSAFE_DIRECT_AI=true`
- `settings.aiExecutionMode === 'direct'`
- the selected provider host permission has been granted
- the model and session-scoped API key are present

The prompt content is built from supported platform pages and may include:

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
- attachments metadata

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
- `temperature`
- `max_output_tokens`
- optional `metadata`

### Gemini

Endpoint:

- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

Headers:

- `content-type: application/json`
- `x-goog-api-key: <apiKey>`

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

When `settings.aiExecutionMode !== 'direct'`, the extension does not call an AI API directly.

Instead it:

1. renders the proposal prompt locally
2. stores that text as a short-lived one-shot `browser.storage.local.pendingChatGptPrompt` record with an expiry and target ChatGPT host
3. requests the optional ChatGPT host permission if it is not already granted
4. opens or focuses the normalized ChatGPT URL, restricted to `https://chatgpt.com/` or `https://chat.openai.com/`
5. injects the packaged `/chatgpt-bridge.js` script with `browser.scripting.executeScript`
6. writes the prompt into the DOM on:
    - `https://chatgpt.com/*`
    - `https://chat.openai.com/*`

Automatic message submission to the AI website is not implemented in the current codebase. The extension does not click the send button.

## Additional Network Requests

The dashboard does not make additional contributor or profile lookup requests.

## What The Extension Does Not Send

Based on the repository code:

- it does not send custom POST or PUT payloads to Mostaql, Khamsat, or Nafezly
- it does not send user prompts or project payloads to the SignalR server
- it does not auto-submit bridge-mode prompts to ChatGPT
- it does not include AI API keys or pending bridge prompts in default backup exports
- it does not include admin messages in default backup exports
- it does not encrypt AI API keys before storing them in browser session storage
