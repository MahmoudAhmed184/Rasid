# Rasid | راصد

Rasid is a private cross-browser Manifest V3 WebExtension for Arabic freelancing platforms. It monitors supported feeds, filters noisy jobs, sends browser notifications, tracks projects, and helps draft proposals through either direct AI provider calls or a ChatGPT bridge workflow.

ملخص بالعربية: راصد إضافة للمتصفحات تراقب فرص العمل الحر في المنصات العربية، ترسل تنبيهات، تحفظ المشاريع المتابعة، وتساعد في توليد العروض عبر الذكاء الاصطناعي أو عبر جسر ChatGPT.

## Contents

- [Project Status](#project-status)
- [What Ships In This Repo](#what-ships-in-this-repo)
- [Capabilities](#capabilities)
- [Platform Support](#platform-support)
- [Browser Support](#browser-support)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Getting Started](#getting-started)
- [Development Commands](#development-commands)
- [Loading The Extension](#loading-the-extension)
- [Optional SignalR Backend](#optional-signalr-backend)
- [Configuration](#configuration)
- [Permissions](#permissions)
- [Privacy And Storage](#privacy-and-storage)
- [Quality Checks](#quality-checks)
- [Documentation](#documentation)
- [Known Notes](#known-notes)

## Project Status

- Package name: `rasid`
- Extension name: `Rasid | راصد`
- Extension version: `1.0.0`
- Manifest version: `3`
- Build system: `wxt`
- Language: TypeScript
- Runtime requirement: Node.js `>=20.19.0`
- Target browsers: Chrome MV3 and Firefox MV3

## Capabilities

Rasid currently provides:

- background monitoring for the registered freelancing platforms
- SignalR-first realtime delivery with polling fallback, plus polling-only mode
- browser notifications and notification sound playback
- popup quick actions for manual checks, notification toggling, and source diagnostics
- a dashboard for overview stats, tracked projects, Mostaql bid tracking, filters, prompts, proposal templates, advanced settings, and backup import/export
- reusable prompt templates plus a separate quick proposal template
- AI proposal generation through OpenAI, Gemini, or Claude in direct mode
- ChatGPT bridge mode that injects a prepared prompt into ChatGPT for manual review and submission
- platform-specific content tools for project extraction, tracking, and proposal autofill where supported
- Mostaql export flows that generate downloadable ZIP bundles without remote code

## Platform Support

| Platform | Background Monitoring | SignalR | Content Tools | Proposal Drafting / Autofill | Export | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Mostaql | Yes | Yes | Yes | Yes | Yes | Richest integration surface, including project tracking and export tooling. |
| Khamsat | Yes | Yes | Yes | Yes | No | Request/project helpers and proposal autofill are active. |
| Nafezly | Yes | Yes | Yes | Yes | No | Project panel, extraction, and autofill are active. |
| Kafiil | No | No | Placeholder only | No | No | A content script and parser code still exist, but the extension does not register Kafiil in `src/platforms/registry.ts`. |
| Freelancer | No | No | No | No | No | Platform id placeholder only. |
| Upwork | No | No | No | No | No | Platform id placeholder only. |

The current background monitoring registry is owned by [`src/platforms/registry.ts`](src/platforms/registry.ts). As of May 22, 2026 it registers only `mostaql`, `khamsat`, and `nafezly`.

## Browser Support

| Browser | Output Directory | Notes |
| --- | --- | --- |
| Chrome / Chromium | `dist/chrome-mv3` | Uses a service worker plus a Chrome-only offscreen document. Minimum Chrome version is `120`. |
| Firefox | `dist/firefox-mv3` | Uses the same MV3 codebase through WXT's Firefox output. Minimum Firefox version is `140.0`. |
| Firefox for Android | `dist/firefox-mv3` | Shares the Firefox build output. Minimum version is `142.0`. |

Chrome receives the `offscreen` permission. Firefox intentionally skips the offscreen entrypoint and runs the same task contract through the local background path.

## How It Works

### Monitoring

The background app is composed in [`src/app/background/create-background-services.ts`](src/app/background/create-background-services.ts).

1. Startup creates storage, notifications, offscreen or local task handlers, platform monitoring adapters, AI providers, proposal generation services, and the SignalR manager.
2. Polling resolves enabled platform feeds, fetches listing HTML, parses normalized job records, optionally enriches detail pages, applies filters, stores results, and publishes notifications.
3. SignalR delivery uses the same downstream publishing path, so realtime and polling batches are processed consistently.

### Content Scripts

Each platform content entrypoint imports exactly one platform adapter. Shared content runtime code lives under `src/app/content/`, while selectors and DOM logic stay inside each platform folder under `src/platforms/<platform>/`.

### AI Proposal Flows

Proposal generation is owned by `src/features/proposals/`.

- `direct` mode sends the rendered prompt to the configured provider API.
- `bridge` mode stores a pending prompt and relies on the ChatGPT bridge content script to inject it into ChatGPT.

Direct mode supports:

- OpenAI
- Gemini
- Claude

Bridge mode currently ships only for:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

### Offscreen Tasks

Chrome MV3 service workers do not have DOM access, so Rasid uses an offscreen document for:

- notification audio playback
- `DOMParser`-based marketplace HTML parsing
- ZIP Blob URL generation for downloads

Firefox uses the same `OffscreenManager` contract in local mode instead of a separate document.

## Architecture

The extension follows a feature-first structure:

- `entrypoints/` contains WXT-facing entrypoints only
- `src/app/` contains composition roots and UI bootstraps
- `src/entities/` contains domain models and AI provider adapters
- `src/features/` contains monitoring, proposals, realtime, notifications, downloads, backup, and settings behavior
- `src/platforms/` contains platform-specific adapters, parsers, feeds, selectors, and content UI
- `src/shared/` contains browser wrappers, storage modules, DOM helpers, parsing helpers, and network utilities

The recent refactor removed the old layer-first roots such as `src/application/`, `src/infrastructure/`, `src/models/`, and `src/ui/`.

## Repository Layout

```text
entrypoints/
  background.ts
  chatgpt-bridge.content.ts
  mostaql.content/
  khamsat.content/
  nafezly.content/
  kafiil.content/
  popup/
  dashboard/
  offscreen/

src/
  app/
  entities/
  features/
  platforms/
  shared/

public/
  icons/

docs/
  01-setup-and-workflow.md
  02-architecture-and-data-flow.md
  03-cross-browser-quirks.md
  04-ai-content-bridge.md
  05-adding-a-platform.md
  firefox-testing.md
  amo-review.md

```

### Key Files

| File | Purpose |
| --- | --- |
| [`wxt.config.ts`](wxt.config.ts) | WXT config, manifest generation, permissions, browser-specific settings, and the SignalR pure-annotation workaround. |
| [`entrypoints/background.ts`](entrypoints/background.ts) | Background entrypoint and lifecycle wiring. |
| [`src/app/background/create-background-services.ts`](src/app/background/create-background-services.ts) | Background composition root. |
| [`src/app/background/background-messages.ts`](src/app/background/background-messages.ts) | Typed runtime message contract for popup, dashboard, and content flows. |
| [`src/platforms/registry.ts`](src/platforms/registry.ts) | Registered extension monitoring platforms and SignalR capability metadata. |
| [`src/shared/storage/extension-storage.ts`](src/shared/storage/extension-storage.ts) | Storage facade for settings, jobs, prompts, tracking, runtime state, and pending proposal state. |
| [`src/shared/browser/offscreen/manager.ts`](src/shared/browser/offscreen/manager.ts) | Chrome offscreen and Firefox local-task abstraction. |

## Getting Started

### Extension Prerequisites

- Node.js `>=20.19.0`
- npm

### Install Dependencies

```bash
npm install
```

`npm install` runs `wxt prepare` through the `postinstall` script.

## Development Commands

| Command | Purpose |
| --- | --- |
| `npm run dev:chrome` | Start WXT dev mode for Chrome MV3. |
| `npm run dev:firefox` | Start WXT dev mode for Firefox MV3. |
| `npm run build` | Build both browser outputs. |
| `npm run build:chrome` | Build `dist/chrome-mv3`. |
| `npm run build:firefox` | Build `dist/firefox-mv3`. |
| `npm run zip:chrome` | Create the Chrome ZIP package. |
| `npm run zip:firefox` | Create the Firefox ZIP package. |
| `npm run lint` | Run ESLint. |
| `npm run lint:fix` | Run ESLint with auto-fixes. |
| `npm run typecheck` | Run TypeScript with `--noEmit`. |
| `npm run format` | Format the repo with Prettier. |
| `npm run format:check` | Check formatting with Prettier. |
| `npm run lint:firefox` | Validate the Firefox build with `web-ext lint`. |

## Loading The Extension

### Chrome

1. Build the Chrome output:

    ```bash
    npm run build:chrome
    ```

2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select `dist/chrome-mv3`.

### Firefox

1. Build the Firefox output:

    ```bash
    npm run build:firefox
    ```

2. Open `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on...`.
4. Select `dist/firefox-mv3/manifest.json`.

Additional Firefox notes live in [docs/firefox-testing.md](docs/firefox-testing.md).

## Configuration

User-facing configuration is stored in browser local storage and managed through the dashboard.

Important settings include:

- global enable / disable
- monitored platform toggles
- notification mode: `auto`, `signalr`, or `polling`
- polling interval from `1` to `30` minutes
- SignalR server URL
- include and exclude keywords
- minimum budget, minimum hiring rate, maximum duration, and category filters
- quiet hours
- notification sound
- AI mode: `bridge` or `direct`
- AI provider, model, API key, and system prompt
- ChatGPT bridge URL
- reusable prompt templates
- quick proposal template
- backup export and import

The settings UI still renders a Kafiil toggle, but background monitoring currently acts only on `mostaql`, `khamsat`, and `nafezly`.

## Permissions

Permissions are generated from [`wxt.config.ts`](wxt.config.ts).

### Extension Permissions

| Permission | Chrome | Firefox | Reason |
| --- | --- | --- | --- |
| `alarms` | Yes | Yes | Scheduling polling, SignalR lease checks, and reconnects. |
| `downloads` | Yes | Yes | Saving generated ZIP exports and backups. |
| `notifications` | Yes | Yes | Browser notifications plus test notification flow. |
| `storage` | Yes | Yes | Settings, jobs, prompts, runtime state, tracking, and pending proposal state. |
| `offscreen` | Yes | No | Chrome-only document for DOM parsing, audio, and Blob URL work. |

### Host Permissions

| Host | Reason |
| --- | --- |
| `https://mostaql.com/*` | Mostaql monitoring, content scripts, extraction, autofill, and export flows. |
| `https://khamsat.com/*` | Khamsat monitoring, parsing, and content tooling. |
| `https://nafezly.com/*` | Nafezly monitoring, parsing, extraction, and autofill. |
| `https://kafiil.com/*` | Kafiil content script and parser support. |
| `https://chatgpt.com/*` | ChatGPT bridge content script. |
| `https://chat.openai.com/*` | Legacy ChatGPT host for the bridge content script. |
| `https://freelancia.runasp.net/*` | Default SignalR backend origin. |
| `https://api.openai.com/*` | Direct OpenAI proposal generation. |
| `https://generativelanguage.googleapis.com/*` | Direct Gemini proposal generation. |
| `https://api.anthropic.com/*` | Direct Claude proposal generation. |

Review-facing permission notes are maintained in [docs/amo-review.md](docs/amo-review.md).

## Privacy And Storage

Rasid stores extension state in browser local storage. That can include:

- settings and filters
- AI configuration and API keys when direct mode is used
- prompt templates and quick proposal template text
- seen job ids and recent job batches
- tracked projects
- runtime SignalR state
- notification click payloads
- pending autofill drafts
- pending ChatGPT bridge prompt state
- backup snapshots exported by the dashboard

Supported page content is read only when the relevant content script is active and only to support tracking, proposal drafting, autofill, and export features.

See [PRIVACY.md](PRIVACY.md) for the privacy disclosure draft.

## Quality Checks

Typical extension verification:

```bash
npm run typecheck
npm run lint
npm run build
npm run lint:firefox
```

Useful structural checks:

```bash
find src entrypoints docs -type d -empty -print
legacy_roots="application|infrastructure|models|ui"
rg "src/(${legacy_roots})|platform-modules" docs src entrypoints -n
```

## Documentation

Extension docs:

- [docs/01-setup-and-workflow.md](docs/01-setup-and-workflow.md)
- [docs/02-architecture-and-data-flow.md](docs/02-architecture-and-data-flow.md)
- [docs/03-cross-browser-quirks.md](docs/03-cross-browser-quirks.md)
- [docs/04-ai-content-bridge.md](docs/04-ai-content-bridge.md)
- [docs/05-adding-a-platform.md](docs/05-adding-a-platform.md)
- [docs/firefox-testing.md](docs/firefox-testing.md)
- [docs/amo-review.md](docs/amo-review.md)

## Known Notes

- The extension monitoring registry currently excludes Kafiil even though Kafiil code still exists under `src/platforms/kafiil/` and in the backend.
- ChatGPT bridge injection is only shipped for `chatgpt.com` and `chat.openai.com`.
- Firefox MV3 intentionally skips the `offscreen` entrypoint during build and uses the local background task path instead.
