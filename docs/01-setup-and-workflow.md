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

| Command | Purpose |
| --- | --- |
| `npm run dev:chrome` | Start a Chrome Manifest V3 development build |
| `npm run dev:firefox` | Start a Firefox Manifest V3 development build |
| `npm run build` | Build both browser targets |
| `npm run build:chrome` | Build `dist/chrome-mv3` |
| `npm run build:firefox` | Build `dist/firefox-mv3` |
| `npm run zip:chrome` | Package the Chrome build |
| `npm run zip:firefox` | Package the Firefox build |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with fixes |
| `npm run format` | Run Prettier in write mode |
| `npm run format:check` | Check Prettier formatting |
| `npm run typecheck` | Run `tsc -p tsconfig.json --noEmit` |
| `npm run lint:firefox` | Run `web-ext lint --source-dir dist/firefox-mv3` |

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

Reusable code is grouped by architectural role:

- `src/application/`
  Use cases, orchestration logic, and message contracts.
- `src/infrastructure/`
  Browser APIs and external service integrations.
- `src/models/`
  Shared domain models.
- `src/platforms/`
  Platform adapters and platform-specific implementations.
- `src/shared/`
  Cross-cutting DOM, parsing, and identity helpers.
- `src/ui/`
  Generic extension surfaces such as popup, dashboard, ChatGPT bridge, and offscreen bootstrap.

Two practical rules follow from this:

1. Browser/runtime details belong in `src/infrastructure/`, not in `src/application/`.
2. Platform-specific DOM code belongs in `src/platforms/<platform>/`, not in generic UI folders.

## Current Source Layout

```text
src/
  application/
    content/
    monitoring/
    proposals/
    runtime/
  infrastructure/
    ai/
    audio/
    downloads/
    notifications/
    offscreen/
    realtime/
    storage/
  models/
  platforms/
    khamsat/
    mostaql/
      content/
  shared/
  ui/
    chatgpt-bridge/
    dashboard/
    popup/
```

## Entrypoint Import Graph

The current high-level graph is:

```text
entrypoints/background.ts
  -> src/application/background/create-background-services.ts
  -> src/application/runtime/background-message-bus.ts

entrypoints/mostaql.content/index.ts
  -> src/application/content/*
  -> src/platforms/platform-modules.ts
    -> src/platforms/mostaql/adapter.ts
      -> src/platforms/mostaql/content/*.ts
  -> src/infrastructure/storage/browser-repositories.ts

entrypoints/khamsat.content/index.ts
  -> src/application/content/*
  -> src/platforms/platform-modules.ts
    -> src/platforms/khamsat/adapter.ts
      -> src/platforms/khamsat/content/*.ts
  -> src/infrastructure/storage/browser-repositories.ts

entrypoints/chatgpt-bridge.content.ts
  -> src/ui/chatgpt-bridge/index.ts
  -> src/infrastructure/storage/browser-repositories.ts

entrypoints/offscreen/main.ts
  -> src/ui/offscreen.ts
  -> src/infrastructure/offscreen/manager.ts
  -> src/platforms/platform-modules.ts

entrypoints/popup/main.ts
  -> src/ui/popup/index.ts
  -> src/infrastructure/storage/browser-repositories.ts

entrypoints/dashboard/main.ts
  -> src/ui/dashboard/index.ts
  -> src/infrastructure/storage/browser-repositories.ts
```

## Platform Registration Rule

Supported platforms are registered in one place:

- `src/platforms/platform-modules.ts`

Do not add new content, monitoring, or parser registries. Add the platform module once and let the rest of the runtime resolve through that manifest.

## Build Outputs

WXT emits browser-specific build folders:

- `dist/chrome-mv3`
- `dist/firefox-mv3`

Chrome also gets the offscreen document entrypoint. Firefox does not, because `entrypoints/offscreen/index.html` includes:

```html
<meta name="wxt.include" content='["chrome"]' />
```
