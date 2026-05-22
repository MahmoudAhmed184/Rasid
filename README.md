# Rasid | راصد

Rasid is a private cross-browser Manifest V3 WebExtension for Arabic freelancing platforms. It monitors supported job feeds, filters noisy listings, sends browser notifications, tracks projects, and helps draft proposals through either direct AI-provider requests or a user-mediated ChatGPT bridge.

ملخص بالعربية: راصد إضافة للمتصفحات تتابع فرص العمل الحر في منصات عربية مدعومة، تعرض تنبيهات، تحفظ المشاريع المتابعة، وتساعد في تجهيز عروض العمل بالذكاء الاصطناعي أو عبر فتح ChatGPT مع نص جاهز للمراجعة اليدوية.

## Contents

- [Project Status](#project-status)
- [Supported Platforms](#supported-platforms)
- [Browser Support](#browser-support)
- [Main Capabilities](#main-capabilities)
- [What Ships In This Repo](#what-ships-in-this-repo)
- [How The Extension Works](#how-the-extension-works)
- [Architecture Overview](#architecture-overview)
- [Repository Layout](#repository-layout)
- [Key Files](#key-files)
- [Getting Started](#getting-started)
- [Development Commands](#development-commands)
- [Build Commands](#build-commands)
- [Loading In Chrome](#loading-in-chrome)
- [Loading In Firefox](#loading-in-firefox)
- [Configuration Overview](#configuration-overview)
- [AI Proposal Modes](#ai-proposal-modes)
- [ChatGPT Bridge Behavior](#chatgpt-bridge-behavior)
- [SignalR And Polling](#signalr-and-polling)
- [Content Scripts](#content-scripts)
- [Offscreen And Local Tasks](#offscreen-and-local-tasks)
- [Storage And Privacy](#storage-and-privacy)
- [Permissions](#permissions)
- [Security Notes](#security-notes)
- [Backup Import And Export](#backup-import-and-export)
- [Testing And Validation](#testing-and-validation)
- [Release Checklist](#release-checklist)
- [Troubleshooting](#troubleshooting)
- [Documentation Index](#documentation-index)
- [Known Limitations](#known-limitations)
- [Contributing And Maintenance](#contributing-and-maintenance)

## Project Status

| Field                          | Current value                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Package name                   | `rasid`                                                                                               |
| Extension name                 | `Rasid / راصد`                                                                                        |
| Version                        | `1.0.0`                                                                                               |
| Manifest version               | MV3                                                                                                   |
| Build system                   | WXT `^0.20.26`                                                                                        |
| Language                       | TypeScript                                                                                            |
| Runtime requirement            | Node.js `>=20.19.0`                                                                                   |
| Browser targets                | Chrome MV3 and Firefox MV3                                                                            |
| Main extension release surface | Mostaql, Khamsat, Nafezly, ChatGPT bridge, direct OpenAI/Gemini/Claude calls, default SignalR backend |

## Supported Platforms

The shipped extension registry is [`src/platforms/registry.ts`](src/platforms/registry.ts). It registers only `mostaql`, `khamsat`, and `nafezly`.

| Platform | Background monitoring | SignalR payloads | Content script               | Proposal drafting | Autofill | Export                         |
| -------- | --------------------- | ---------------- | ---------------------------- | ----------------- | -------- | ------------------------------ |
| Mostaql  | Yes                   | Yes              | Yes, `https://mostaql.com/*` | Yes               | Yes      | Yes, project/message ZIP flows |
| Khamsat  | Yes                   | Yes              | Yes, `https://khamsat.com/*` | Yes               | Yes      | No platform export flow        |
| Nafezly  | Yes                   | Yes              | Yes, `https://nafezly.com/*` | Yes               | Yes      | No platform export flow        |

## Browser Support

| Browser target        | Build command           | Output directory   | Manifest notes                                                                                                                          |
| --------------------- | ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome / Chromium MV3 | `npm run build:chrome`  | `dist/chrome-mv3`  | Background service worker, content scripts, `offscreen` permission, `minimum_chrome_version: "120"`                                     |
| Firefox MV3           | `npm run build:firefox` | `dist/firefox-mv3` | Background script output generated by WXT, no `offscreen` permission, Gecko ID `rasid@mostaql-notifier`, strict minimum Firefox `140.0` |
| Firefox for Android   | `npm run build:firefox` | `dist/firefox-mv3` | Gecko Android strict minimum version `142.0`                                                                                            |

WXT rewrites the source popup/dashboard entrypoints into generated extension pages such as `popup.html` and `dashboard.html` in the build output.

## Main Capabilities

- Feed monitoring for Mostaql, Khamsat, and Nafezly.
- SignalR-first realtime notifications with polling fallback and a polling-only mode.
- Manual polling and source diagnostics from the popup.
- Browser notifications with stored click payloads and optional generated notification audio.
- Dashboard overview, filters, prompt manager, quick proposal template, tracked projects, Mostaql bid tracker, settings, and backup import/export.
- Platform content panels for project tracking and proposal generation.
- Proposal generation through direct OpenAI, Gemini, or Claude requests.
- ChatGPT bridge mode for user-mediated prompt insertion into `chatgpt.com` or `chat.openai.com`.
- Mostaql export tools that generate ZIP downloads from bundled code and bounded remote attachment fetches.

## What Ships In This Repo

- WebExtension source under `entrypoints/` and `src/`.
- Static icons under `public/icons/`.
- WXT, TypeScript, ESLint, Prettier, web-ext, Vitest, and Playwright test configuration.
- Optional backend source under `server/`, which is out of the WebExtension release package unless the repository owner decides otherwise.

The browser extension does not execute remote scripts. AI provider calls and marketplace/backend fetches are network requests made by bundled extension code.

## How The Extension Works

1. `entrypoints/background.ts` creates the background app and registers lifecycle, alarm, download, notification, and runtime-message handlers.
2. `src/app/background/create-background-services.ts` composes storage, platform monitoring adapters, notification/audio/download services, SignalR, offscreen/local tasks, prompt templates, and proposal generation.
3. Polling uses platform monitoring adapters to fetch HTML, parse listings, hydrate new jobs, apply filters, store state, and publish notifications.
4. SignalR listens for `NewJobsDetected` from the default backend and sends normalized jobs through the same downstream publishing path as polling.
5. Content scripts mount platform-specific UI only on matching pages and use a narrowed repository surface for prompts, proposals, and tracking.
6. Proposal generation either calls the selected direct provider or stores a short-lived bridge prompt and opens a normalized ChatGPT URL.

## Architecture Overview

```text
WXT entrypoints
  background / popup / dashboard / content scripts / offscreen
        |
src/app
  composition roots and UI bootstraps
        |
src/features
  monitoring, realtime, notifications, downloads, proposals, backup, settings
        |
src/entities
  domain models, defaults, provider contracts, validators
        |
src/platforms
  Mostaql, Khamsat, Nafezly adapters, parsers, selectors, content UI
        |
src/shared
  browser storage wrappers, storage modules, DOM helpers, parsing helpers, network utilities
```

Chrome uses an offscreen document for audio, DOM parsing, and Blob URL work. Firefox uses the same task contract through local background handlers because the Firefox build omits the Chrome-only offscreen entrypoint.

## Repository Layout

```text
entrypoints/
  background.ts
  chatgpt-bridge.content.ts
  dashboard/
  khamsat.content/
  mostaql.content/
  nafezly.content/
  offscreen/
  popup/

src/
  app/
  entities/
  features/
  platforms/
  shared/

public/
  icons/

docs/
  reference/

tests/
server/
```

Generated or local-only folders:

- `.wxt/` is generated by `wxt prepare`.
- `dist/` is generated by WXT builds.
- `.test-dist/` is generated by `npm test`.
- `node_modules/` is installed by npm.

## Key Files

| File                                                                                                   | Purpose                                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [`package.json`](package.json)                                                                         | Scripts, dependency list, Node engine, and WXT/web-ext tooling.                                                             |
| [`wxt.config.ts`](wxt.config.ts)                                                                       | WXT config, generated manifest fields, browser-specific permissions, host permissions, and SignalR build plugin workaround. |
| [`entrypoints/background.ts`](entrypoints/background.ts)                                               | MV3 background entrypoint and lifecycle registration.                                                                       |
| [`src/app/background/create-background-services.ts`](src/app/background/create-background-services.ts) | Background composition root.                                                                                                |
| [`src/app/background/background-messages.ts`](src/app/background/background-messages.ts)               | Runtime message request/response contract and validators.                                                                   |
| [`src/features/offscreen/manager.ts`](src/features/offscreen/manager.ts)                               | Chrome offscreen and Firefox local-task abstraction.                                                                        |
| [`src/platforms/registry.ts`](src/platforms/registry.ts)                                               | Registered extension platform modules and SignalR support metadata.                                                         |
| [`src/shared/storage/extension-storage.ts`](src/shared/storage/extension-storage.ts)                   | Storage facade over settings, jobs, prompts, tracking, runtime, notifications, and download cleanup.                        |
| [`PRIVACY.md`](PRIVACY.md)                                                                             | Privacy disclosure based on the current codebase.                                                                           |

## Getting Started

Prerequisites:

- Node.js `>=20.19.0`
- npm

Install dependencies from the committed lockfile:

```bash
npm ci
```

`npm ci` runs `wxt prepare` through the `postinstall` script. Use `npm install` only when intentionally changing dependencies.

## Development Commands

| Command                    | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `npm run dev:chrome`       | Start WXT dev mode for Chrome MV3.                           |
| `npm run dev:firefox`      | Start WXT dev mode for Firefox MV3.                          |
| `npm run typecheck`        | Run TypeScript with `--noEmit`.                              |
| `npm run lint`             | Run TypeScript unused checks through `lint:ts`, then ESLint. |
| `npm run lint:fix`         | Run ESLint with auto-fixes.                                  |
| `npm test`                 | Typecheck and run Vitest unit and integration tests.         |
| `npm run test:unit`        | Run the source-mirrored unit test slice.                     |
| `npm run test:integration` | Run background, feature, entrypoint, and policy tests.       |
| `npm run test:e2e:chrome`  | Run Playwright Chromium extension smoke tests.               |
| `npm run test:coverage`    | Run Vitest with V8 coverage reporting.                       |
| `npm run format`           | Format the repository with Prettier.                         |
| `npm run format:check`     | Check formatting with Prettier.                              |

## Build Commands

| Command                 | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `npm run build`         | Build Chrome and Firefox MV3 outputs.             |
| `npm run build:chrome`  | Build `dist/chrome-mv3`.                          |
| `npm run build:firefox` | Build `dist/firefox-mv3`.                         |
| `npm run zip:chrome`    | Ask WXT to package the Chrome MV3 build.          |
| `npm run zip:firefox`   | Ask WXT to package the Firefox MV3 build.         |
| `npm run lint:firefox`  | Run `web-ext lint --source-dir dist/firefox-mv3`. |

Run `npm run build` before Firefox linting because `lint:firefox` reads the generated Firefox output directory.

## Loading In Chrome

1. Run:

    ```bash
    npm run build:chrome
    ```

2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Select `Load unpacked`.
5. Choose `dist/chrome-mv3`.

## Loading In Firefox

1. Run:

    ```bash
    npm run build:firefox
    ```

2. Open `about:debugging#/runtime/this-firefox`.
3. Select `Load Temporary Add-on...`.
4. Choose `dist/firefox-mv3/manifest.json`.

## Configuration Overview

User-facing configuration is stored through browser storage and managed from the dashboard.

| Setting area      | Current behavior                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Global monitoring | `systemEnabled` controls whether monitoring runs.                                                                                                            |
| Platforms         | Only `mostaql`, `khamsat`, and `nafezly` are supported monitoring toggles.                                                                                   |
| Notification mode | `auto`, `signalr`, or `polling`; current transport resolution treats enabled supported SignalR platforms as SignalR-capable unless polling mode is selected. |
| Polling interval  | Clamped from 1 to 30 minutes.                                                                                                                                |
| SignalR backend   | Store build resolves to `https://freelancia.runasp.net/jobNotificationHub`. Custom backend origins are not accepted by current settings normalization.       |
| Filters           | Minimum budget, minimum hiring rate, include/exclude keywords, maximum duration, minimum client age, and quiet hours.                                        |
| AI                | Bridge/direct mode, provider, model, session-scoped API key, system prompt, and ChatGPT URL.                                                                 |
| Prompts           | Reusable prompt templates plus one quick proposal template.                                                                                                  |
| Backup            | Dashboard export/import for non-secret extension state.                                                                                                      |

## AI Proposal Modes

| Mode     | Network behavior                                           | Storage behavior                                                                                     | User action                                        |
| -------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `bridge` | No direct provider API call. Opens normalized ChatGPT URL. | Stores a short-lived one-shot `pendingChatGptPrompt` in `browser.storage.local`.                     | User reviews and submits in ChatGPT manually.      |
| `direct` | Sends prompt to OpenAI, Gemini, or Claude endpoint.        | API key is kept in `browser.storage.session` under `aiApiKeySecret` and not persisted in `settings`. | User reviews generated text before using autofill. |

Direct provider defaults are `maxOutputTokens: 900` and `temperature: 0.4` in [`src/features/proposals/generate-direct-proposal.ts`](src/features/proposals/generate-direct-proposal.ts).

## ChatGPT Bridge Behavior

The bridge content script runs only on:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

Bridge flow:

1. Render prompt variables locally with untrusted platform fields delimited.
2. Store a pending bridge prompt with ID, target host, creation time, expiry time, and max text length.
3. Open the normalized ChatGPT URL.
4. The bridge content script finds the ChatGPT input, writes the prompt, dispatches input/change events, and clears the matching prompt after successful injection or terminal input lookup failure.

The current code does not click the ChatGPT send button.

## SignalR And Polling

The default backend URL is `https://freelancia.runasp.net/jobNotificationHub`.

SignalR behavior:

- Implemented in [`src/features/realtime/signalr-manager.ts`](src/features/realtime/signalr-manager.ts).
- Uses `@microsoft/signalr`.
- Configures WebSockets, Server-Sent Events, and Long Polling transports.
- Listens for the `NewJobsDetected` event.
- Normalizes inbound jobs before storage and notification processing.
- Uses alarms for health checks, lease rotation, reconnects, and polling fallback because MV3 workers are suspendable.

Polling fallback behavior:

- Implemented in [`src/features/monitoring/run-polling-cycle.ts`](src/features/monitoring/run-polling-cycle.ts).
- Fetches platform feed HTML with `GET`, `credentials: "omit"`, `cache: "no-store"`, and `referrerPolicy: "no-referrer"`.
- Detects known challenge-page markers before parsing.
- Hydrates new jobs with detail-page fetches where possible.
- Applies configured filters before notification.
- Updates runtime monitoring timestamps and error summaries.

## Content Scripts

| Entrypoint                                                                       | Match patterns                                       | Runtime role                                                                                                  |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`entrypoints/mostaql.content/index.ts`](entrypoints/mostaql.content/index.ts)   | `https://mostaql.com/*`                              | Project tracking, proposal generation, autofill, dashboard/home stats, profile tools, message/project export. |
| [`entrypoints/khamsat.content/index.ts`](entrypoints/khamsat.content/index.ts)   | `https://khamsat.com/*`                              | Request panel, proposal generation, tracking, autofill.                                                       |
| [`entrypoints/nafezly.content/index.ts`](entrypoints/nafezly.content/index.ts)   | `https://nafezly.com/*`                              | Project panel, proposal generation, tracking, autofill.                                                       |
| [`entrypoints/chatgpt-bridge.content.ts`](entrypoints/chatgpt-bridge.content.ts) | `https://chatgpt.com/*`, `https://chat.openai.com/*` | One-shot bridge prompt insertion.                                                                             |

Content scripts receive narrowed repositories from [`src/app/repositories/browser-repositories.ts`](src/app/repositories/browser-repositories.ts), not the full backup/settings repository surface.

## Offscreen And Local Tasks

Chrome MV3 uses [`entrypoints/offscreen/index.html`](entrypoints/offscreen/index.html) and [`src/app/offscreen/bootstrap-offscreen.ts`](src/app/offscreen/bootstrap-offscreen.ts) for:

- generated notification audio
- `DOMParser` marketplace HTML parsing
- ZIP Blob URL creation and revocation

Firefox uses `createOffscreenManager({ mode: "local" })` and registers equivalent local handlers in the background runtime. The task contract is shared in [`src/features/offscreen/manager.ts`](src/features/offscreen/manager.ts) and [`src/features/offscreen/tasks.ts`](src/features/offscreen/tasks.ts).

## Storage And Privacy

Persistent extension state is stored in `browser.storage.local`. Direct-mode AI API keys are stored separately in `browser.storage.session` and restricted to trusted extension contexts where the browser supports `storage.session.setAccessLevel`.

Persistent snapshot keys:

- `settings`
- `seenJobs`
- `recentJobs`
- `stats`
- `trackedProjects`
- `prompts`
- `proposalTemplate`
- `notificationsEnabled`
- `runtime`

Auxiliary state includes short-lived pending bridge prompts, queued platform autofill drafts, notification click payloads, and pending download-cleanup records.

See [`PRIVACY.md`](PRIVACY.md) and [`docs/17-privacy-and-security-model.md`](docs/17-privacy-and-security-model.md) for the detailed privacy model.

## Permissions

Permissions are generated from [`wxt.config.ts`](wxt.config.ts).

| Permission      | Chrome | Firefox | Reason                                                                         |
| --------------- | ------ | ------- | ------------------------------------------------------------------------------ |
| `alarms`        | Yes    | Yes     | Polling, SignalR health, lease, and reconnect scheduling.                      |
| `downloads`     | Yes    | Yes     | Saving generated ZIP exports.                                                  |
| `notifications` | Yes    | Yes     | Browser job and test notifications.                                            |
| `storage`       | Yes    | Yes     | Settings, jobs, prompts, tracking, runtime, bridge prompts, and cleanup state. |
| `offscreen`     | Yes    | No      | Chrome-only audio, DOM parsing, and Blob URL tasks.                            |

Host permissions:

| Host                                          | Reason                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `https://mostaql.com/*`                       | Mostaql monitoring, content tools, project extraction, autofill, and export downloads. |
| `https://khamsat.com/*`                       | Khamsat monitoring, parser, content panel, and autofill.                               |
| `https://nafezly.com/*`                       | Nafezly monitoring, parser, content panel, and autofill.                               |
| `https://chatgpt.com/*`                       | ChatGPT bridge content script.                                                         |
| `https://chat.openai.com/*`                   | Legacy ChatGPT bridge content script host.                                             |
| `https://freelancia.runasp.net/*`             | Default SignalR backend.                                                               |
| `https://api.openai.com/*`                    | Direct OpenAI proposal generation.                                                     |
| `https://generativelanguage.googleapis.com/*` | Direct Gemini proposal generation.                                                     |
| `https://api.anthropic.com/*`                 | Direct Claude proposal generation.                                                     |

## Security Notes

- Runtime background messages validate known actions, payload shape, sender origin, and response shape.
- Offscreen messages use a dedicated channel, request IDs, task-specific payload guards, response guards, and same-extension sender checks.
- Proposal payloads enforce URL host allowlists and field-size limits before prompt rendering/provider calls.
- Prompt variables are wrapped as untrusted fields before AI use.
- Gemini API keys are sent in `x-goog-api-key`, not in the query string.
- Notification click URLs and ZIP remote attachment URLs are normalized to supported HTTPS platform hosts.
- Mostaql ZIP export caps entry count, per-file bytes, total bytes, and remote fetch time.
- The extension stores direct-mode API keys in session storage, but it does not encrypt the value before writing to browser storage.

## Backup Import And Export

Dashboard backup export:

- includes `schemaVersion: 1` and `exportedAt`
- exports normalized persistent settings and non-secret proposal-state keys
- omits `settings.aiApiKey`, `aiApiKeySecret`, and `pendingChatGptPrompt`

Dashboard backup import:

- rejects non-object or unsupported-version payloads
- normalizes imported state through storage normalizers
- clears stale bridge prompts
- clears the current session AI API key
- requires dashboard confirmation before applying

## Testing And Validation

Primary release checks:

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
npm run lint:firefox
```

Targeted consistency checks should verify unsupported-platform references, deleted legacy-doc references, and unresolved editorial markers across README/docs/source. The required scans are listed in the documentation validation task for this release.

Current unit tests cover AI chat URL normalization, settings normalization, backup secret handling, and Mostaql bid tracker calculations.

The expanded automated suite now covers parser fixtures for Mostaql/Khamsat/Nafezly, storage/message contracts, AI provider payloads, prompt rendering, monitoring/realtime reducers, ZIP export safety, dashboard tab behavior, generated-manifest, and Chrome Playwright E2E scaffolding. See [`tests/README.md`](tests/README.md) and [`docs/20-testing-strategy.md`](docs/20-testing-strategy.md).

## Release Checklist

1. Install with `npm ci`.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Run `npm test`.
5. Run `npm run format:check`.
6. Run `npm run build`.
7. Run `npm run lint:firefox`.
8. Inspect `dist/chrome-mv3/manifest.json` and `dist/firefox-mv3/manifest.json` for permissions, host permissions, and content scripts.
9. Load `dist/chrome-mv3` in Chrome and smoke test popup, dashboard, notifications, SignalR/polling controls, and supported content scripts.
10. Load `dist/firefox-mv3/manifest.json` in Firefox and smoke test the same release-critical flows.
11. Run `npm run zip:chrome` and `npm run zip:firefox` for store packages.
12. Keep [`PRIVACY.md`](PRIVACY.md), [`docs/16-store-review-notes.md`](docs/16-store-review-notes.md), and generated manifests synchronized.

## Troubleshooting

| Symptom                                     | Check                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| WXT types are missing                       | Run `npm ci` or `npm run postinstall` to regenerate `.wxt/`.                                                       |
| Firefox lint cannot find a source directory | Run `npm run build:firefox` first.                                                                                 |
| No notifications appear                     | Confirm browser notification permission, `notificationsEnabled`, quiet hours, and supported platform filters.      |
| Realtime does not connect                   | Check dashboard connection status and remember the packaged extension accepts only the default backend origin.     |
| Polling finds no jobs                       | Use popup source diagnostics and inspect runtime monitoring errors in dashboard state.                             |
| Direct AI mode fails                        | Confirm provider, model, API key, and host permission are present; provider errors are redacted and categorized.   |
| Bridge prompt does not appear               | Confirm the target is `https://chatgpt.com/` or `https://chat.openai.com/` and the pending prompt has not expired. |
| Autofill does not apply                     | Confirm the queued draft platform/project ID matches the current page and the target form fields are loaded.       |

More detail is in [`docs/14-troubleshooting.md`](docs/14-troubleshooting.md).

## Documentation Index

Start with [`docs/README.md`](docs/README.md). Key docs:

- [`docs/01-overview.md`](docs/01-overview.md)
- [`docs/02-high-level-architecture.md`](docs/02-high-level-architecture.md)
- [`docs/03-runtime-data-flow.md`](docs/03-runtime-data-flow.md)
- [`docs/06-storage-and-state.md`](docs/06-storage-and-state.md)
- [`docs/10-ai-proposals-and-chatgpt-bridge.md`](docs/10-ai-proposals-and-chatgpt-bridge.md)
- [`docs/12-browser-permissions-and-privacy.md`](docs/12-browser-permissions-and-privacy.md)
- [`docs/13-build-test-release.md`](docs/13-build-test-release.md)
- [`docs/reference/folder-structure.md`](docs/reference/folder-structure.md)
- [`docs/reference/source/entrypoints.md`](docs/reference/source/entrypoints.md)

## Known Limitations

- Direct AI mode necessarily sends prompt content and the user-provided API key to the selected provider from the browser extension runtime.
- ChatGPT bridge mode writes a prompt into the ChatGPT page but does not submit it.
- Chrome browser E2E is available through Playwright after `npm run build:chrome`; Firefox remains build/lint/manifest smoke rather than full browser automation.
- Full TypeScript-aware ESLint is not configured because no TypeScript ESLint dependency has been added.
- The optional `server/` tree remains a repository-scope decision and is not part of the documented WebExtension release package.

## Contributing And Maintenance

Use the current feature-first layout. Keep WXT entrypoints thin, platform-specific selectors/parsers inside `src/platforms/<platform>/`, reusable behavior in `src/features/`, domain contracts in `src/entities/`, and browser/storage helpers in `src/shared/`.

When behavior changes, update the README, [`PRIVACY.md`](PRIVACY.md), and the relevant docs under `docs/`. Permission, platform, AI, storage, or release-surface changes should also update store-review notes and validation evidence.
