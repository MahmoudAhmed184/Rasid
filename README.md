# Frelancia

Frelancia is a cross-browser Manifest V3 extension for Mostaql that helps freelancers discover new projects quickly, filter noise, and draft stronger proposals with AI-assisted workflows.

ملخص بالعربية: إضافة لمستقل تعمل على Chrome و Firefox لتنبيهك بالمشاريع الجديدة، تتبع المشاريع والعروض، وتساعدك على تجهيز العروض بالذكاء الاصطناعي.

## Overview

Frelancia combines project monitoring, browser-side workflow automation, and configurable AI drafting into a single extension. The codebase now uses a WXT and TypeScript architecture with browser-specific builds generated from one source tree.

The extension includes:

- Real-time project notifications through SignalR with automatic polling fallback
- Configurable filtering by category, budget, hiring rate, duration, keywords, and quiet hours
- AI proposal workflows with reusable prompt templates
- Direct provider support for OpenAI, Gemini, and Claude
- Bridge-mode drafting that can hand off proposal prompts to a configurable chat UI
- Popup and dashboard surfaces for monitoring, settings, diagnostics, and prompt management
- Mostaql page enhancements for autofill, tracking, and export workflows
- ZIP export for project details and conversation data

## Browser Support

| Browser | Build Output | Notes |
| --- | --- | --- |
| Chrome-based browsers | `dist/chrome-mv3` | Minimum Chrome version declared in the manifest: `120` |
| Firefox | `dist/firefox-mv3` | Minimum Firefox version declared in the manifest: `140.0` |

The Chrome build uses an offscreen document for supported background tasks. Firefox uses the same source tree but skips the offscreen entrypoint during packaging by design.

## Architecture

The project is organized around WXT entrypoints and shared source modules:

- `entrypoints/`: browser entrypoints for the background worker, popup, dashboard, Mostaql content script, ChatGPT bridge, and Chrome offscreen document
- `src/core/`: reusable services for AI generation, job ingestion, notifications, downloads, storage, SignalR, DOM parsing, and offscreen coordination
- `src/models/`: shared domain models, defaults, and runtime configuration types
- `src/ui/`: popup, dashboard, content-script, chat bridge, offscreen, and shared UI modules
- `public/`: static assets such as icons that are copied into the build output
- `docs/`: operational notes for Firefox testing and store review workflows

Build artifacts are generated into:

- `dist/chrome-mv3`
- `dist/firefox-mv3`

## Feature Set

### Notification and Monitoring

- SignalR-based job delivery with polling fallback
- Manual check from the popup
- Notification toggle and test actions
- Tracked projects with persisted local state
- Connection diagnostics for Mostaql reachability

### AI and Proposal Workflow

- Prompt templates stored in extension storage
- Proposal generation context built from Mostaql project metadata
- Direct API mode for `openai`, `gemini`, and `claude`
- Bridge mode for handing prompt text to a configured chat page
- Quick bid and autofill actions on Mostaql project pages

### Dashboard and Reporting

- Settings management for filtering, AI mode, intervals, and quiet hours
- Prompt and proposal template management
- Bid tracker and 30-day timeline analytics
- Runtime status and connection visibility
- Project export and monitoring utilities

## Getting Started

### Prerequisites

- Node.js
- npm

A recent Node.js LTS release is recommended.

### Install Dependencies

```bash
npm install
```

`npm install` runs `wxt prepare` automatically through `postinstall`. If generated WXT files are ever missing after a cleanup or branch reset, run:

```bash
npm run postinstall
```

## Development

Start a development build for one browser target:

```bash
npm run dev:chrome
npm run dev:firefox
```

Create production builds for both targets:

```bash
npm run build
```

Create a single target build:

```bash
npm run build:chrome
npm run build:firefox
```

Create packaged zip archives:

```bash
npm run zip:chrome
npm run zip:firefox
```

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run postinstall` | Generate WXT types and prepared files |
| `npm run dev:chrome` | Start Chrome MV3 development mode |
| `npm run dev:firefox` | Start Firefox MV3 development mode |
| `npm run build` | Build Chrome and Firefox packages |
| `npm run build:chrome` | Build the Chrome package only |
| `npm run build:firefox` | Build the Firefox package only |
| `npm run zip:chrome` | Package the Chrome build as a zip |
| `npm run zip:firefox` | Package the Firefox build as a zip |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with automatic fixes |
| `npm run format` | Format the repository with Prettier |
| `npm run format:check` | Check formatting with Prettier |
| `npm run typecheck` | Run the TypeScript compiler in no-emit mode |
| `npm run lint:firefox` | Run `web-ext lint` against `dist/firefox-mv3` |

## Load the Extension Locally

### Chrome

1. Run `npm run build:chrome`.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select `dist/chrome-mv3`.

### Firefox

1. Run `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on...`.
4. Select `dist/firefox-mv3/manifest.json`.

Additional Firefox-specific guidance is available in [`docs/firefox-testing.md`](docs/firefox-testing.md).

## How the Runtime Is Split

- The background entrypoint orchestrates alarms, storage, SignalR, polling, notifications, downloads, and AI request handling.
- The Mostaql content entrypoint injects workflow helpers into project, message, home, and profile pages.
- The popup provides quick status, a manual check action, diagnostics, and a notification toggle.
- The dashboard exposes the broader management surface for prompts, tracked projects, settings, and bid analytics.

## Remote Services and Permissions

The manifest currently declares host permissions for:

- `https://mostaql.com/*`
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://frelancia.runasp.net/*`
- `https://api.openai.com/*`
- `https://generativelanguage.googleapis.com/*`
- `https://api.anthropic.com/*`

These permissions are used for Mostaql page access, optional AI drafting flows, and the SignalR notification backend.

## Privacy and Data Handling

Frelancia stores its operational state in browser local storage, including:

- notification and filter settings
- prompt templates and proposal templates
- tracked projects
- recent jobs and seen job identifiers
- lightweight runtime state used for notifications and connection management

See [`PRIVACY.md`](PRIVACY.md) for the current privacy disclosure draft.

## Quality Checks

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm run build
```

If you are validating Firefox packaging or release readiness, also run:

```bash
npm run lint:firefox
```

## Documentation

- [`PRIVACY.md`](PRIVACY.md)
- [`docs/firefox-testing.md`](docs/firefox-testing.md)

## Contributing

Issues and pull requests are welcome. Keep changes scoped, document behavior changes, and include the relevant verification steps in your PR.

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE).
