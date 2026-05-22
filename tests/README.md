# Rasid Test Suite

The test suite is TypeScript-first and mirrors `src/` and `entrypoints/` ownership where practical.

## Commands

```bash
npm test
npm run test:typecheck
npm run test:unit
npm run test:integration
npm run test:coverage
npm run test:e2e:chrome
npm run test:e2e:firefox
```

`npm test` runs test TypeScript checking, then the Vitest unit and integration slices.

Chrome E2E requires a built Chrome extension:

```bash
npm run build:chrome
npm run test:e2e:chrome
```

Firefox E2E requires a built Firefox extension and a Playwright Firefox browser runtime:

```bash
npx playwright install firefox
npm run build:firefox
npm run lint:firefox
npm run test:e2e:firefox
```

The Firefox gate combines generated-manifest assertions, `web-ext run` temporary add-on installation, and Playwright Firefox rendering checks for generated popup/dashboard pages.

## Layout

- `tests/support/`: typed helpers for assertions, fixtures, DOM, fake storage, fake browser state, and timers.
- `tests/fixtures/`: deterministic marketplace HTML, AI responses, and backup payloads.
- `tests/src/`: unit and integration tests mirroring source ownership.
- `tests/entrypoints/`: generated-manifest and release-policy tests.
- `tests/e2e/chrome/`: Playwright Chromium extension smoke tests.
- `tests/e2e/firefox/`: Firefox manifest, temporary-install, and generated-page browser smoke tests.

## Fixture Policy

Tests must not call live marketplaces, AI providers, ChatGPT, or external SignalR services. Use static HTML/JSON fixtures, fake fetch responses, fake browser APIs, fake storage, and local Playwright route fulfillment.
