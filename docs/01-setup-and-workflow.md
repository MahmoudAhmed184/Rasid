# Setup And Workflow

## Runtime Requirements

- Package manager: `npm`
- Node.js version: Not implemented in current codebase.

The repository does not declare an `engines.node` field in `package.json`, and there is no `.nvmrc`, `.node-version`, or `.tool-versions` file. Reviewers and contributors therefore need to choose a Node.js version themselves.

## Install

```bash
npm install
```

`npm install` runs the `postinstall` script automatically:

```bash
npm run postinstall
```

That script executes:

```bash
wxt prepare
```

Run `npm run postinstall` again if generated WXT types or prepared files are missing after a cleanup.

## Development Scripts

These scripts are defined exactly in `package.json`:

| Command | Purpose |
| --- | --- |
| `npm run dev:chrome` | Start a Chrome Manifest V3 development build with `wxt -b chrome --mv3` |
| `npm run dev:firefox` | Start a Firefox Manifest V3 development build with `wxt -b firefox --mv3` |
| `npm run build` | Build both browsers by chaining `build:chrome` then `build:firefox` |
| `npm run build:chrome` | Build `dist/chrome-mv3` with `wxt build -b chrome --mv3` |
| `npm run build:firefox` | Build `dist/firefox-mv3` with `wxt build -b firefox --mv3` |
| `npm run zip:chrome` | Package the Chrome build with `wxt zip -b chrome --mv3` |
| `npm run zip:firefox` | Package the Firefox build with `wxt zip -b firefox --mv3` |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with fixes |
| `npm run format` | Run Prettier in write mode |
| `npm run format:check` | Check formatting with Prettier |
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

`entrypoints/` contains files that WXT should treat as extension entrypoints or extension HTML pages:

- `entrypoints/background.ts`
- `entrypoints/mostaql.content/index.ts`
- `entrypoints/chatgpt-bridge.content.ts`
- `entrypoints/popup/index.html`
- `entrypoints/popup/main.ts`
- `entrypoints/dashboard/index.html`
- `entrypoints/dashboard/main.ts`
- `entrypoints/offscreen/index.html`
- `entrypoints/offscreen/main.ts`

New manifest-facing surfaces should be added here, not in `src/`.

### `src/`

`src/` contains reusable modules that are imported by entrypoints but are not entrypoints themselves:

- `src/core/`: background services and shared runtime logic
- `src/models/`: shared types, defaults, constants
- `src/ui/`: popup, dashboard, content-script UI, bridge UI, offscreen handler code

This is reinforced by the comment in `wxt.config.ts`: the codebase keeps WXT entrypoints separate from reusable source modules.

## EntryPoint Import Graph

The current WXT graph is:

```text
entrypoints/background.ts
  -> src/core/ai.ts
  -> src/core/audio.ts
  -> src/core/dom.ts
  -> src/core/downloads.ts
  -> src/core/offscreen-manager.ts
  -> src/core/jobs.ts
  -> src/core/notifications.ts
  -> src/core/signalr.ts
  -> src/core/storage.ts
  -> src/models/ai.ts
  -> src/models/extension.ts

entrypoints/mostaql.content/index.ts
  -> src/ui/mostaql/autofill.mjs
  -> src/ui/mostaql/export.mjs
  -> src/ui/mostaql/home.mjs
  -> src/ui/mostaql/profile.mjs
  -> src/ui/mostaql/project-sidebar.mjs
  -> src/ui/mostaql/runtime.mjs
  -> entrypoints/mostaql.content/style.css

entrypoints/chatgpt-bridge.content.ts
  -> src/ui/chatgpt-bridge/index.mjs

entrypoints/offscreen/main.ts
  -> src/ui/offscreen.ts
    -> src/core/audio.ts
    -> src/core/dom.ts
    -> src/core/offscreen-manager.ts

entrypoints/popup/main.ts
  -> src/ui/popup/index.ts

entrypoints/dashboard/main.ts
  -> src/ui/dashboard/index.ts
    -> src/ui/dashboard/bid-tracker.ts
    -> src/ui/dashboard/connection.ts
    -> src/ui/dashboard/contributors.ts
    -> src/ui/dashboard/prompts.ts
    -> src/ui/dashboard/projects.ts
    -> src/ui/dashboard/settings.ts
    -> src/ui/dashboard/tabs.ts
```

## Build Outputs

WXT emits browser-specific build folders:

- `dist/chrome-mv3`
- `dist/firefox-mv3`

Chrome also gets the offscreen document entrypoint. Firefox does not, because `entrypoints/offscreen/index.html` includes:

```html
<meta name="wxt.include" content='["chrome"]' />
```
