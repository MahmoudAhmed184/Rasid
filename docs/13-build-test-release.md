# Build, Test, And Release

## Setup

```bash
npm ci
```

Node.js must satisfy `>=20.19.0`.

## Development

```bash
npm run dev:chrome
npm run dev:firefox
```

## Build

```bash
npm run build:chrome
npm run build:firefox
npm run build
```

Outputs:

- `dist/chrome-mv3`
- `dist/firefox-mv3`

## Package

```bash
npm run zip:chrome
npm run zip:firefox
```

The ZIP commands are WXT package commands for the browser target and MV3 manifest version.

## Validation Commands

```bash
npm run test:typecheck
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
npm run lint:firefox
```

`npm run lint` runs:

1. `npm run lint:ts`
2. `eslint .`

`npm run lint:ts` runs TypeScript with `--noEmit --noUnusedLocals --noUnusedParameters`.

## Automated Tests

`npm test` runs:

1. `npm run test:typecheck`
2. `npm run test:unit`
3. `npm run test:integration`

The test suite uses Vitest with WXT's official test plugin. Tests live under `tests/src/**` and `tests/entrypoints/**`, mirroring source ownership where practical.

Additional test commands:

- `npm run test:coverage` writes Vitest V8 coverage under `coverage/vitest`.
- `npm run test:e2e:chrome` runs Playwright Chromium extension smoke tests against `dist/chrome-mv3`.
- `npm run test:e2e:firefox` builds and lints Firefox output, then runs generated-manifest smoke tests.

## Generated Manifest Inspection

After `npm run build`, inspect:

- `dist/chrome-mv3/manifest.json`
- `dist/firefox-mv3/manifest.json`

Confirm:

- supported platform hosts only for marketplace content scripts
- ChatGPT bridge hosts present
- direct AI provider hosts present
- Chrome includes `offscreen`
- Firefox omits `offscreen`
- browser-specific settings match `wxt.config.ts`

## Manual Smoke Tests

Chrome:

1. Load `dist/chrome-mv3`.
2. Open popup.
3. Run manual check.
4. Toggle notifications.
5. Open dashboard.
6. Save settings.
7. Test notification and sound.
8. Visit supported platform pages and verify panels/autofill behavior where safe.

Firefox:

1. Load `dist/firefox-mv3/manifest.json`.
2. Repeat popup/dashboard/content smoke tests.
3. Run `npm run lint:firefox` after the Firefox build.

## Release Checklist

- `npm ci`
- validation commands pass
- generated manifests inspected
- README and privacy docs match generated permissions
- store-review notes updated for any permission/privacy/platform changes
- source package excludes generated and private local artifacts
- ZIP commands run for target browsers

Related docs:

- [`20-testing-strategy.md`](20-testing-strategy.md)
- [`16-store-review-notes.md`](16-store-review-notes.md)
