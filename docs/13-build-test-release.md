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
dotnet restore server/src/Rasid.Server.sln --locked-mode
dotnet build server/src/Rasid.Server.sln -c Release --no-restore
dotnet test server/src/Rasid.Server.sln -c Release --no-build
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

The optional backend solution targets `net10.0` and is pinned by the root `global.json` to SDK `10.0.300` with `latestFeature` roll-forward. Backend CI uses tracked `packages.lock.json` files, central package versions in `server/Directory.Packages.props`, and build policy from `server/Directory.Build.props`, so local backend validation should use the locked restore/build/test sequence above.

Additional test commands:

- `npm run test:coverage` writes Vitest V8 coverage under `coverage/vitest`.
- `npm run test:e2e:chrome` runs Playwright Chromium extension smoke tests against `dist/chrome-mv3`.
- `npm run test:e2e:firefox` builds and lints Firefox output, runs generated-manifest smoke tests, verifies temporary add-on installation with `web-ext run`, and renders generated popup/dashboard pages in Playwright Firefox. Run `npx playwright install firefox` once if the Playwright Firefox runtime is missing.

## Generated Manifest Inspection

After `npm run build`, inspect:

- `dist/chrome-mv3/manifest.json`
- `dist/firefox-mv3/manifest.json`

Confirm:

- supported platform hosts only for marketplace content scripts
- `scripting` permission is present for on-demand bridge injection
- ChatGPT bridge hosts are optional host permissions, not static content-script hosts
- direct AI provider hosts are absent from normal builds and present only in unsafe side builds
- required hosts include supported marketplaces, `https://rasid.runasp.net/*`, and `http://localhost/*`
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
9. Trigger bridge mode and verify the ChatGPT permission/open/injection path.

Firefox:

1. Load `dist/firefox-mv3/manifest.json`.
2. Repeat popup/dashboard/content smoke tests.
3. Run `npm run lint:firefox` after the Firefox build.

## Release Checklist

- `npm ci`
- validation commands pass
- generated manifests inspected
- backend locked restore/build/test sequence run when backend contracts changed
- `dotnet publish server/src/Rasid.Server.csproj -c Release --no-restore -o /tmp/rasid-server-publish` run when backend release behavior changed
- README and privacy docs match generated permissions
- store-review notes updated for any permission/privacy/platform changes
- source package excludes generated and private local artifacts
- ZIP commands run for target browsers

Related docs:

- [`20-testing-strategy.md`](20-testing-strategy.md)
- [`16-store-review-notes.md`](16-store-review-notes.md)
