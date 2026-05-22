# High-Level Architecture

Rasid uses a feature-first WebExtension architecture. WXT owns browser entrypoint discovery and manifest generation; the reusable logic lives under `src/`.

## Component Map

```text
entrypoints/
  WXT-facing background, popup, dashboard, content, and offscreen entrypoints

src/app/
  composition roots and UI/content bootstraps

src/features/
  use-case modules: monitoring, realtime, proposals, notifications, downloads, backup, settings

src/entities/
  models, defaults, provider contracts, URL helpers, state helpers

src/platforms/
  platform adapters, selectors, HTML parsers, feeds, content UI

src/shared/
  browser wrappers, storage modules, DOM helpers, parsing helpers, network helpers
```

## Runtime Model

| Runtime context                  | Entrypoint                              | Main responsibilities                                                                                 |
| -------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Background service worker/script | `entrypoints/background.ts`             | Bootstrap storage/services, own alarms, SignalR, polling, notifications, downloads, runtime messages. |
| Popup extension page             | `entrypoints/popup/`                    | Quick stats, manual check, notification toggle, source diagnostics, dashboard open action.            |
| Dashboard/options page           | `entrypoints/dashboard/`                | Settings, filters, prompts, proposal template, backup import/export, tracked projects, bid tracker.   |
| Platform content scripts         | `entrypoints/*.content/`                | Mount supported platform UI, extract project context, queue autofill, track projects.                 |
| ChatGPT bridge content script    | `entrypoints/chatgpt-bridge.content.ts` | Inject one-shot bridge prompt into ChatGPT input and clear consumed prompt.                           |
| Chrome offscreen document        | `entrypoints/offscreen/`                | Audio playback, DOM parsing, ZIP object URL creation/revocation.                                      |
| Firefox local task path          | `src/features/offscreen/manager.ts`     | Runs the same offscreen task contract in background-local mode.                                       |

## Chrome vs Firefox MV3 Differences

Chrome:

- `wxt.config.ts` adds `offscreen` permission.
- `entrypoints/offscreen/index.html` is included only for Chrome through `meta name="wxt.include" content='["chrome"]'`.
- Offscreen document is created with reasons `AUDIO_PLAYBACK`, `BLOBS`, and `DOM_PARSER`.

Firefox:

- The generated manifest omits `offscreen`.
- The background app registers local handlers for ZIP creation/revocation.
- The monitoring parser and audio service still use the same `OffscreenManager` task API.

## Background Role

The background app created by `createBackgroundApp()` owns:

- `ExtensionStorage`
- notification handlers and payload cleanup
- download cleanup service
- offscreen/local task manager
- platform monitoring adapters
- proposal generator and provider registry
- SignalR manager
- runtime message handlers
- serialized ingestion queue for polling and realtime batches

## Popup And Dashboard Roles

The popup and dashboard use repositories from `src/app/repositories/browser-repositories.ts`.

- Popup uses `MonitoringRepository` for stats and notification toggles plus background messages for actions.
- Dashboard uses backup, monitoring, prompt, proposal, settings, and tracking repositories.
- Both pages are Arabic RTL extension pages.

## Content Script Role

Platform content scripts:

- use the platform adapter's `matches`
- determine the current `PlatformPage`
- mount only contributions that match the page kind
- retry deferred contributions while route/page DOM changes settle
- extract `PlatformProposalSource` for tracking and proposal generation
- poll queued autofill drafts until fields are available or the draft expires

## Data Boundaries

| Boundary                           | Mechanism                                                    |
| ---------------------------------- | ------------------------------------------------------------ |
| Persistent extension state         | `browser.storage.local` through storage modules.             |
| Direct AI API key                  | `browser.storage.session` under `aiApiKeySecret`.            |
| Popup/dashboard/background actions | Validated runtime messages in `background-messages.ts`.      |
| Background/offscreen tasks         | Validated task envelopes in `features/offscreen/manager.ts`. |
| Platform-specific DOM              | Platform adapter modules under `src/platforms/<platform>/`.  |
| Provider network requests          | Provider adapters under `src/entities/ai/providers/`.        |

Related docs:

- [`03-runtime-data-flow.md`](03-runtime-data-flow.md)
- [`04-low-level-design.md`](04-low-level-design.md)
- [`05-module-boundaries.md`](05-module-boundaries.md)
