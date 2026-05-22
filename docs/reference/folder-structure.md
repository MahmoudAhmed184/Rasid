# Folder Structure Reference

This reference documents meaningful folders in the current repository.

## Root

| Path                            | Purpose                                                            | Runtime role               | Release relevance                                | Do not place here                            |
| ------------------------------- | ------------------------------------------------------------------ | -------------------------- | ------------------------------------------------ | -------------------------------------------- |
| `package.json`                  | npm metadata, scripts, dependencies, Node engine.                  | Build/test tooling.        | Source of truth for commands.                    | Undocumented scripts or dependencies.        |
| `package-lock.json`             | Locked npm dependency graph.                                       | Install reproducibility.   | Required for `npm ci`.                           | Manual edits outside npm.                    |
| `wxt.config.ts`                 | WXT config and manifest generation.                                | Build-time manifest owner. | Permissions, host permissions, browser settings. | Runtime business logic.                      |
| `tsconfig.json`                 | TypeScript config extending `.wxt/tsconfig.json`.                  | Typechecking.              | Release gate through `typecheck`/`lint:ts`.      | Generated output includes.                   |
| `eslint.config.mjs`             | ESLint flat config for JS/MJS and ignore list.                     | Static checks.             | Release gate through `npm run lint`.             | TypeScript rule claims not backed by config. |
| `.github/`                      | Contribution guide, issue forms, PR template, and security policy. | Repository process.        | Maintainer/review process.                       | Runtime docs.                                |
| `.gitignore`, `.prettierignore` | Generated/local artifact exclusion.                                | Tooling hygiene.           | Source-package cleanliness.                      | Private secrets.                             |

## `entrypoints/`

Purpose: WXT-facing entrypoints.

Ownership:

- keep entrypoints thin
- import CSS needed by content/extension pages
- delegate to `src/app/**`
- define WXT background/content-script metadata

Important files:

- `background.ts`
- `chatgpt-bridge.content.ts`
- `mostaql.content/`
- `khamsat.content/`
- `nafezly.content/`
- `popup/`
- `dashboard/`
- `offscreen/`

Runtime role:

- generated manifest background, popup, dashboard/options page, content scripts, and Chrome offscreen page.

Do not place:

- storage normalizers
- AI provider implementations
- platform parsing rules beyond selecting adapter matches

## `src/app/`

Purpose: application composition and UI/content bootstraps.

Subfolders:

| Path                      | Purpose                                                         | Runtime role                       |
| ------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| `src/app/background/`     | Background app composition, message bus, message handlers.      | Background service worker/script.  |
| `src/app/chatgpt-bridge/` | ChatGPT prompt injection app.                                   | Bridge content script.             |
| `src/app/content/`        | Shared platform content bootstrap/autofill/service composition. | Platform content scripts.          |
| `src/app/dashboard/`      | Dashboard controllers and CSS.                                  | Extension options/dashboard page.  |
| `src/app/offscreen/`      | Chrome offscreen document bootstrap.                            | Chrome offscreen document.         |
| `src/app/popup/`          | Popup controller and CSS.                                       | Extension action popup.            |
| `src/app/repositories/`   | Repository composition for extension pages and content scripts. | Browser storage access boundaries. |

Do not place:

- platform selectors
- provider endpoint details
- storage schema definitions

## `src/entities/`

Purpose: shared domain models, constants, and small pure helpers.

Subfolders:

| Path                       | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `src/entities/ai/`         | AI provider IDs, request contracts, provider adapters, prompt URL helpers. |
| `src/entities/job/`        | Job and tracked project models plus identity helpers.                      |
| `src/entities/monitoring/` | Monitoring stats model.                                                    |
| `src/entities/platform/`   | Platform IDs, display names, URL helpers, autofill draft model.            |
| `src/entities/prompt/`     | Prompt template model.                                                     |
| `src/entities/runtime/`    | Runtime and SignalR state models.                                          |
| `src/entities/settings/`   | Settings model, supported platform defaults, polling clamps.               |

Runtime role: imported by features, platforms, shared storage, and app modules.

Do not place:

- browser API calls
- DOM selectors
- feature orchestration

## `src/features/`

Purpose: use-case behavior.

Subfolders:

| Path             | Purpose                                                                     | Runtime role                                 |
| ---------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| `backup/`        | Backup export/import repository.                                            | Dashboard backup workflow.                   |
| `downloads/`     | ZIP generation and download cleanup.                                        | Background/offscreen download flow.          |
| `monitoring/`    | Polling, fetching, filters, batch publication, tracking repositories.       | Background monitoring and UI repositories.   |
| `notifications/` | Browser notification and audio services.                                    | Background notifications/offscreen audio.    |
| `offscreen/`     | Shared offscreen/local task protocol.                                       | Background and Chrome offscreen.             |
| `proposals/`     | Prompt repositories, template rendering, direct/bridge proposal generation. | Background/content/dashboard proposal flows. |
| `realtime/`      | SignalR state machine, effects, manager, constants.                         | Background realtime and fallback.            |
| `settings/`      | Settings repository wrapper.                                                | Dashboard settings.                          |

Do not place:

- platform-specific DOM extraction unless the feature is platform-owned
- WXT entrypoint definitions

## `src/platforms/`

Purpose: platform-specific runtime behavior.

Subfolders:

| Path                                      | Purpose                                                                                | Runtime role                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- |
| `src/platforms/mostaql/`                  | Mostaql adapter, feeds, selectors, parsers, bid tracker, content UI/export/autofill.   | Monitoring and content scripts.    |
| `src/platforms/khamsat/`                  | Khamsat adapter, feed, selectors, parser, project panel, content extraction.           | Monitoring and content scripts.    |
| `src/platforms/nafezly/`                  | Nafezly adapter, feed, selectors, parser, project panel, autofill, content extraction. | Monitoring and content scripts.    |
| `src/platforms/registry.ts`               | Registered platform modules.                                                           | Background monitoring composition. |
| `src/platforms/contracts.ts`              | Platform adapter and content service contracts.                                        | Shared platform/app boundary.      |
| `src/platforms/monitoring-html-parser.ts` | Offscreen/local parser bridge.                                                         | Background monitoring.             |

Do not place:

- unsupported platform code in the shipped release surface
- cross-platform storage modules

## `src/shared/`

Purpose: generic infrastructure utilities.

Subfolders:

| Path                  | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `src/shared/browser/` | Browser storage clients and session-storage access restriction. |
| `src/shared/dom/`     | Form event helpers, HTML fragment querying, icon CSS shim.      |
| `src/shared/network/` | Challenge-page detection.                                       |
| `src/shared/parsing/` | Arabic date, duration, and numeric parsing.                     |
| `src/shared/storage/` | Storage schema, keys, snapshot normalization, storage modules.  |

Do not place:

- Mostaql/Khamsat/Nafezly selectors
- AI provider endpoint logic
- background app composition

## `public/`

Purpose: static assets copied into extension builds.

Current files:

- `public/icons/icon16.png`
- `public/icons/icon48.png`
- `public/icons/icon128.png`

Runtime role: manifest icons, popup/dashboard icons, notification icon.

Do not place:

- remote code
- secrets
- large generated artifacts

## `.github/`

Purpose: repository contribution process.

Important files:

- `.github/CONTRIBUTING.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/SECURITY.md`

Release relevance: prompts contributors to call out permissions, browser behavior, tests, and documentation updates.

## `docs/`

Purpose: project documentation.

Subfolders:

| Path                     | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `docs/reference/`        | Folder/source/function references.       |
| `docs/reference/source/` | Source-area file and function reference. |

Do not place:

- generated build output
- private credentials

## `tests/`

Purpose: TypeScript-first automated tests for unit, integration, parser fixture, release-policy, and browser E2E coverage.

Important paths:

- `tests/README.md`
- `tests/tsconfig.json`
- `tests/support/`
- `tests/fixtures/`
- `tests/src/`
- `tests/entrypoints/`
- `tests/e2e/`

Runtime role: none in extension builds.

Ownership:

- mirror `src/**` and `entrypoints/**` where practical
- keep fixtures deterministic and local
- do not call live marketplaces, AI providers, ChatGPT, or external SignalR services

## Generated Or Ignored Folders

| Path            | Generated by            | Notes                                       |
| --------------- | ----------------------- | ------------------------------------------- |
| `.wxt/`         | `wxt prepare`           | Generated WXT type/config support; ignored. |
| `dist/`         | WXT build commands      | Generated extension builds; ignored.        |
| `coverage/`     | `npm run test:coverage` | Vitest coverage output; ignored.            |
| `node_modules/` | npm                     | Dependencies; ignored.                      |

## Optional Backend

`server/` contains optional backend source and docs. It is outside the default WebExtension release documentation scope. Extension docs must not treat backend platform capabilities as shipped extension support unless extension source, registry, config, UI, privacy docs, and generated manifests all prove that support is shipped.
