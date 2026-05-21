# Setup And Workflow

## Runtime Requirements

- Package manager: `npm`
- Node.js version: not pinned in the repository

The project still does not declare `engines.node`, `.nvmrc`, or `.node-version`, so contributors should use a recent Node.js LTS release.

## Install

```bash
npm install
```

`npm install` runs:

```bash
npm run postinstall
```

That script executes:

```bash
wxt prepare
```

Run `npm run postinstall` again if generated WXT files are missing after a cleanup or branch reset.

## Development Scripts

These scripts are defined in `package.json`:

| Command                 | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `npm run dev:chrome`    | Start a Chrome Manifest V3 development build     |
| `npm run dev:firefox`   | Start a Firefox Manifest V3 development build    |
| `npm run build`         | Build both browser targets                       |
| `npm run build:chrome`  | Build `dist/chrome-mv3`                          |
| `npm run build:firefox` | Build `dist/firefox-mv3`                         |
| `npm run zip:chrome`    | Package the Chrome build                         |
| `npm run zip:firefox`   | Package the Firefox build                        |
| `npm run lint`          | Run ESLint                                       |
| `npm run lint:fix`      | Run ESLint with fixes                            |
| `npm run format`        | Run Prettier in write mode                       |
| `npm run format:check`  | Check Prettier formatting                        |
| `npm run typecheck`     | Run `tsc -p tsconfig.json --noEmit`              |
| `npm run lint:firefox`  | Run `web-ext lint --source-dir dist/firefox-mv3` |

## WXT Directory Rules

The repository uses these WXT settings:

- `srcDir: '.'`
- `entrypointsDir: 'entrypoints'`
- `publicDir: 'public'`
- `outDir: 'dist'`
- `outDirTemplate: '{{browser}}-mv{{manifestVersion}}'`
- Vite alias: `@ -> src`

This creates a strict split:

### `entrypoints/`

Only manifest-facing surfaces belong here:

- `entrypoints/background.ts`
- `entrypoints/mostaql.content/index.ts`
- `entrypoints/khamsat.content/index.ts`
- `entrypoints/chatgpt-bridge.content.ts`
- `entrypoints/popup/main.ts`
- `entrypoints/dashboard/main.ts`
- `entrypoints/offscreen/main.ts`

New browser entrypoints should be added here, not under `src/`.

### `src/`

Reusable code is grouped by feature-first ownership:

- `src/app/`
  Extension surfaces and composition roots for background, popup, dashboard, offscreen, content bootstrap, and ChatGPT bridge.
- `src/features/`
  Product capabilities such as monitoring, proposals, realtime, notifications, downloads, backup, and settings.
- `src/platforms/`
  Platform adapters and platform-specific implementations.
- `src/entities/`
  Shared domain models.
- `src/shared/`
  Cross-cutting browser, storage, DOM, parsing, and network helpers.

Two practical rules follow from this:

1. Browser/runtime utilities belong in `src/shared/` unless a feature owns the behavior.
2. Platform-specific DOM code belongs in `src/platforms/<platform>/`, not in generic app surfaces.

## Current Source Layout

```text
src/
  app/
    background/
    content/
    dashboard/
    offscreen/
    popup/
    chatgpt-bridge/
  features/
    monitoring/
    proposals/
    realtime/
    notifications/
    downloads/
    backup/
    settings/
  platforms/
    kafiil/
    khamsat/
    mostaql/
    nafezly/
    registry.ts
    contracts.ts
    platform-ids.ts
  entities/
    ai/
    job/
    prompt/
    runtime/
    settings/
  shared/
    browser/
    dom/
    network/
    parsing/
    storage/
```

## Entrypoint Import Graph

The current high-level graph is:

```text
entrypoints/background.ts
  -> src/app/background/create-background-services.ts
  -> src/app/background/background-message-bus.ts

entrypoints/mostaql.content/index.ts
  -> src/app/content/*
  -> src/platforms/mostaql/index.ts
    -> src/platforms/mostaql/adapter.ts
      -> src/platforms/mostaql/content/*.ts
  -> src/shared/browser/browser-repositories.ts

entrypoints/khamsat.content/index.ts
  -> src/app/content/*
  -> src/platforms/khamsat/index.ts
    -> src/platforms/khamsat/adapter.ts
      -> src/platforms/khamsat/content/*.ts
  -> src/shared/browser/browser-repositories.ts

entrypoints/chatgpt-bridge.content.ts
  -> src/app/chatgpt-bridge/index.ts
  -> src/shared/browser/browser-repositories.ts

entrypoints/offscreen/main.ts
  -> src/app/offscreen/bootstrap-offscreen.ts
  -> src/shared/browser/offscreen/manager.ts
  -> src/platforms/registry.ts

entrypoints/popup/main.ts
  -> src/app/popup/index.ts
  -> src/shared/browser/browser-repositories.ts

entrypoints/dashboard/main.ts
  -> src/app/dashboard/index.ts
  -> src/shared/browser/browser-repositories.ts
```

## Platform Registration Rule

Supported platforms are registered in one place:

- `src/platforms/registry.ts`

Do not add new content, monitoring, or parser registries. Add the platform module once and let the rest of the runtime resolve through that manifest.

## Build Outputs

WXT emits browser-specific build folders:

- `dist/chrome-mv3`
- `dist/firefox-mv3`

Chrome also gets the offscreen document entrypoint. Firefox does not, because `entrypoints/offscreen/index.html` includes:

```html
<meta name="wxt.include" content='["chrome"]' />
```
