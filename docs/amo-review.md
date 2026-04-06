# Mozilla Add-on Review Notes

## Package Under Review

- Source manifest generator: `wxt.config.ts`
- Firefox build output: `dist/firefox-mv3`
- Firefox minimum version from source config: `140.0`
- Firefox for Android minimum version from source config: `142.0`
- Gecko extension ID: `frelancia@mostaql-notifier`

## How To Build From Source

1. Install Node.js and npm.
   - Exact Node.js version: Not implemented in current codebase.
   - The repository does not declare `engines.node`, `.nvmrc`, or `.node-version`.
2. Install dependencies:

   ```bash
   npm install
   ```

3. If WXT generated files are missing, run:

   ```bash
   npm run postinstall
   ```

4. Build the Firefox package:

   ```bash
   npm run build:firefox
   ```

5. The Firefox output is written to:

   ```text
   dist/firefox-mv3
   ```

6. Optional validation:

   ```bash
   npm run lint:firefox
   ```

7. Temporary load in Firefox:
   - Open `about:debugging#/runtime/this-firefox`
   - Choose `Load Temporary Add-on...`
   - Select `dist/firefox-mv3/manifest.json`

## Permission Justification

### Extension permissions

#### `alarms`

Required for the background scheduler in `src/core/signalr.ts`.

The code creates and manages:

- `jobs:poll`
- `signalr:health`
- `signalr:lease`
- `signalr:reconnect`

These alarms drive:

- Mostaql polling
- SignalR health checks
- SignalR lease rotation
- SignalR reconnect backoff

#### `downloads`

Required for `src/core/downloads.ts`.

The extension builds ZIP archives from user-requested exports and then calls `browser.downloads.download(...)` to save them. The export path is triggered only from Mostaql UI buttons added by the content script.

#### `notifications`

Required for `src/core/notifications.ts`.

The extension creates browser notifications for newly detected Mostaql projects and for the dashboard test action. It also handles notification clicks by opening the stored project URL in a new tab.

#### `storage`

Required across the entire extension.

The code persists:

- settings, including AI mode and API key
- seen job IDs
- recent jobs
- stats
- tracked projects
- prompt templates
- proposal template text
- runtime SignalR state
- temporary autofill and bridge payloads
- per-notification click payloads

#### `offscreen`

Not present in the Firefox AMO build.

The source config adds `offscreen` only when `browser === 'chrome'`. Firefox uses the local background execution path instead of a Chrome offscreen document.

#### `webRequest`

Not requested in current codebase.

### Host permissions

#### `https://mostaql.com/*`

Required for the extension’s primary functionality.

The code uses this host permission for:

- the Mostaql content script (`entrypoints/mostaql.content/index.ts`)
- HTML feed polling in `src/core/jobs.ts`
- project detail hydration in `src/core/jobs.ts`
- bid tracker requests in `src/ui/dashboard/bid-tracker.ts`
- homepage analytics requests in `src/ui/dashboard/bid-tracker.ts`
- deep project scraping in `src/ui/mostaql/data.mjs`
- export attachment downloads in `src/core/downloads.ts`

#### `https://chatgpt.com/*`

Required for the optional bridge workflow.

The code injects a content script on this host in `entrypoints/chatgpt-bridge.content.ts` and writes a prepared proposal prompt into the chat input DOM when the user explicitly starts bridge mode from a Mostaql project page.

#### `https://chat.openai.com/*`

Required for the same optional bridge workflow on the legacy OpenAI chat host.

The same bridge content script matches this host and uses the same prompt injection behavior.

#### `https://frelancia.runasp.net/*`

Required for realtime job notifications.

`src/core/signalr.ts` connects to `https://frelancia.runasp.net/jobNotificationHub` by default unless the user overrides the hub URL in settings.

#### `https://api.openai.com/*`

Required for optional direct AI generation when the user chooses:

- `aiExecutionMode = direct`
- `aiProvider = openai`

The background sends the rendered Mostaql prompt to `POST /v1/responses`.

#### `https://generativelanguage.googleapis.com/*`

Required for optional direct AI generation when the user chooses:

- `aiExecutionMode = direct`
- `aiProvider = gemini`

The background sends the rendered Mostaql prompt to Gemini’s `generateContent` endpoint.

#### `https://api.anthropic.com/*`

Required for optional direct AI generation when the user chooses:

- `aiExecutionMode = direct`
- `aiProvider = claude`

The background sends the rendered Mostaql prompt to Anthropic’s `messages` endpoint.

## Firefox-Specific Notes

- Firefox does not use the Chrome offscreen document path.
- In Firefox, audio playback and HTML parsing use the local handler path in `src/core/audio.ts`, `src/core/dom.ts`, and `src/core/offscreen-manager.ts`.
- The source config declares:

  ```json
  "data_collection_permissions": {
    "required": ["websiteContent"]
  }
  ```

This is because the extension reads Mostaql page content to build notifications, tracked-project records, exports, and optional AI prompts.

## Reviewer Test Flow

1. Build and load the Firefox package from source.
2. Open `https://mostaql.com/projects`.
3. Open the popup and click `فحص الآن`.
4. Open the dashboard and verify:
   - settings save
   - `فحص الإشعار`
   - `فحص الصوت`
   - connection status rendering
   - tracked projects rendering
5. Open a Mostaql project page and verify:
   - `مراقبة` toggles tracked state
   - `سريع` queues autofill
   - `ذكاء` opens the AI workflow
   - `تصدير` creates the ZIP export

## Additional Review Notes

- The dashboard “contributors” panel fetches `https://api.github.com/repos/Elaraby218/Frelancia/contributors`, but that host is not declared as a host permission and is not part of the core extension workflow.
- The extension does not request `webRequest`.
- The extension does not use remote code execution. Runtime logic comes from the packaged WXT bundle and npm dependencies.
