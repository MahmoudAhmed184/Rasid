# Frelancia

Frelancia is a cross-browser Manifest V3 extension for Arabic freelancing platforms that helps freelancers discover new opportunities quickly, filter noise, and draft stronger proposals with AI-assisted workflows.

ملخص بالعربية: إضافة للعمل الحر تعمل على Chrome و Firefox لتنبيهك بالفرص الجديدة، تتبع المشاريع والطلبات، وتساعدك على تجهيز الردود والعروض بالذكاء الاصطناعي.

## Overview

Frelancia combines project monitoring, browser-side workflow automation, and configurable AI drafting into a single extension. The codebase is built with WXT, TypeScript, and a layered `src/` layout that separates application flows from browser infrastructure and platform-specific DOM code.

The extension includes:

- Real-time project notifications through SignalR with automatic polling fallback
- Configurable filtering by category, budget, hiring rate, duration, keywords, and quiet hours
- AI proposal workflows with reusable prompt templates
- Direct provider support for OpenAI, Gemini, and Claude
- Bridge-mode drafting that can hand off proposal prompts to a configurable chat UI
- Popup and dashboard surfaces for monitoring, settings, diagnostics, and prompt management
- Platform page enhancements for autofill, tracking, export, and AI workflows
- Current platform adapters for Mostaql and Khamsat
- ZIP export for project details and conversation data

## Browser Support

| Browser | Build Output | Notes |
| --- | --- | --- |
| Chrome-based browsers | `dist/chrome-mv3` | Minimum Chrome version declared in the manifest: `120` |
| Firefox | `dist/firefox-mv3` | Minimum Firefox version declared in the manifest: `140.0` |

The Chrome build uses an offscreen document for supported background tasks. Firefox uses the same source tree but skips the offscreen entrypoint during packaging by design.

## Source Layout

The repository keeps WXT entrypoints in `entrypoints/` and reusable code in `src/`.

### `entrypoints/`

Manifest-facing surfaces only:

- `entrypoints/background.ts`
- `entrypoints/mostaql.content/index.ts`
- `entrypoints/khamsat.content/index.ts`
- `entrypoints/chatgpt-bridge.content.ts`
- `entrypoints/popup/main.ts`
- `entrypoints/dashboard/main.ts`
- `entrypoints/offscreen/main.ts`

### `src/`

- `src/application/`
  Use cases and runtime contracts.
  Includes monitoring flows, proposal generation orchestration, content bootstrap, and background message handling.
- `src/infrastructure/`
  Browser and transport details.
  Includes storage, repositories, SignalR, notifications, downloads, offscreen RPC, audio, and AI provider clients.
- `src/models/`
  Shared TypeScript domain models.
- `src/platforms/`
  Platform abstractions and platform-specific implementations.
  Mostaql and Khamsat parsing, monitoring, and content injectors live under `src/platforms/`.
- `src/ui/`
  Generic extension surfaces that are not tied to one freelancing platform.
  Includes popup, dashboard, ChatGPT bridge, and offscreen page bootstrap.

This structure keeps platform-specific DOM code out of generic UI folders and keeps browser APIs out of application workflows.

## Runtime Split

- `entrypoints/background.ts` is the WXT composition root. It delegates service wiring to `src/application/background/create-background-services.ts` and runtime transport registration to `src/application/runtime/background-message-bus.ts`.
- `src/application/runtime/background-messages.ts` defines the typed request/response contract used by popup, dashboard, and content scripts.
- `src/application/runtime/background-runtime-handlers.ts` maps those messages to use cases.
- `src/platforms/platform-modules.ts` is the single manifest for supported platforms. It resolves content adapters, monitoring adapters, monitoring parsers, and realtime capability metadata.
- `src/platforms/mostaql/adapter.ts` and `src/platforms/khamsat/adapter.ts` implement platform-specific content behavior.
- `src/platforms/*/content/*.ts` contains platform-specific DOM extraction, injection, autofill, and export logic.
- `src/infrastructure/realtime/signalr-reducer.ts` and `src/infrastructure/realtime/signalr-effects.ts` make SignalR state transitions and alarm effects explicit while `src/infrastructure/realtime/signalr-manager.ts` stays focused on orchestration.
- `src/infrastructure/offscreen/*` hides the Chrome offscreen-vs-Firefox local execution split.

## Development

### Prerequisites

- Node.js
- npm

A recent Node.js LTS release is recommended. The repository does not currently declare an `engines.node` field.

### Install

```bash
npm install
```

`npm install` runs `wxt prepare` automatically through `postinstall`. If generated WXT files are missing after a cleanup or branch reset, run:

```bash
npm run postinstall
```

### Development Builds

```bash
npm run dev:chrome
npm run dev:firefox
```

### Production Builds

```bash
npm run build
```

Or per target:

```bash
npm run build:chrome
npm run build:firefox
```

### Packaged ZIP Builds

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

## Load The Extension Locally

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

Additional Firefox-specific guidance is available in [docs/firefox-testing.md](/home/mahmoud-ahmed/Projects/Frelancia/docs/firefox-testing.md).

## Remote Services And Permissions

The manifest currently declares host permissions for:

- `https://mostaql.com/*`
- `https://khamsat.com/*`
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://frelancia.runasp.net/*`
- `https://api.openai.com/*`
- `https://generativelanguage.googleapis.com/*`
- `https://api.anthropic.com/*`

These permissions are used for supported platform page access, optional AI drafting flows, and the SignalR notification backend.

## Privacy And Data Handling

Frelancia stores its operational state in browser local storage, including:

- notification and filter settings
- prompt templates and proposal templates
- tracked projects
- recent jobs and seen job identifiers
- lightweight runtime state used for notifications and connection management
- temporary bridge/autofill payloads

See [PRIVACY.md](/home/mahmoud-ahmed/Projects/Frelancia/PRIVACY.md) for the current privacy disclosure draft.

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

- [docs/01-setup-and-workflow.md](/home/mahmoud-ahmed/Projects/Frelancia/docs/01-setup-and-workflow.md)
- [docs/02-architecture-and-data-flow.md](/home/mahmoud-ahmed/Projects/Frelancia/docs/02-architecture-and-data-flow.md)
- [docs/03-cross-browser-quirks.md](/home/mahmoud-ahmed/Projects/Frelancia/docs/03-cross-browser-quirks.md)
- [docs/04-ai-content-bridge.md](/home/mahmoud-ahmed/Projects/Frelancia/docs/04-ai-content-bridge.md)
- [docs/05-adding-a-platform.md](/home/mahmoud-ahmed/Projects/Frelancia/docs/05-adding-a-platform.md)
- [docs/firefox-testing.md](/home/mahmoud-ahmed/Projects/Frelancia/docs/firefox-testing.md)
- [docs/amo-review.md](/home/mahmoud-ahmed/Projects/Frelancia/docs/amo-review.md)

## Contributing

Issues and pull requests are welcome. Keep changes scoped, document behavior changes, and include the relevant verification steps in your PR.

## License

This project is licensed under the MIT License. See [LICENSE](/home/mahmoud-ahmed/Projects/Frelancia/LICENSE).
