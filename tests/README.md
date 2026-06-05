# Frelancia Test Suite

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
dotnet restore server/src/Rasid.Server.sln --locked-mode
dotnet build server/src/Rasid.Server.sln -c Release --no-restore
dotnet test server/src/Rasid.Server.sln -c Release --no-build
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

The server commands validate the optional `net10.0` backend solution the same way CI does: locked restore, Release build, then xUnit v3 tests through the Microsoft Testing Platform runner. Server tests use the ASP.NET Core test host for endpoint smoke tests, admin broadcast validation, startup validation, Khamsat freshness, and scraper behavior.

## Layout

- `tests/support/`: typed helpers for assertions, fixtures, DOM, fake storage, fake browser state, and timers.
- `tests/fixtures/`: deterministic marketplace HTML, AI responses, and backup payloads.
- `tests/src/`: unit and integration tests mirroring source ownership.
- `tests/entrypoints/`: generated-manifest, bridge entrypoint, and release-policy tests.
- `tests/e2e/chrome/`: Playwright Chromium extension smoke tests.
- `tests/e2e/firefox/`: Firefox manifest, temporary-install, and generated-page browser smoke tests.

## Fixture Policy

Tests must not call live marketplaces, AI providers, ChatGPT, or external SignalR services. Use static HTML/JSON fixtures, fake fetch responses, fake browser APIs, fake storage, and local Playwright route fulfillment.

## Coverage Notes

Current coverage includes manifest-policy checks, unlisted ChatGPT bridge entrypoint tests, background bridge/admin-message handlers, popup admin banner behavior, monitoring fetch failure/freshness behavior, Firefox generated-page tests, and backend health/provider/admin-broadcast/startup/Khamsat tests.
