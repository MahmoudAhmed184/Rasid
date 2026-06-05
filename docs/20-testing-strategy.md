# Testing Strategy

## Current Automated Tests

The repository uses a TypeScript-first Vitest suite with WXT's official Vitest plugin plus Playwright scaffolding for browser smoke tests.

Current automated coverage includes:

- pure entities: AI chat URLs, provider adapters, job identity, platform URL safety, settings clamps
- shared utilities: Arabic/date/duration/number parsing, challenge-page detection, storage modules
- storage/contracts: settings secret migration, backup import/export, proposal state TTL/one-shot behavior, notification payloads, download cleanup records
- background/runtime contracts: runtime message request/response validation, bridge opening, admin-message handling, and dispatch
- monitoring/realtime/downloads: filters, batch publication, per-platform fetch failures, Khamsat freshness handling, SignalR reducer/manager, ZIP safety
- platform fixtures: Mostaql, Khamsat, and Nafezly listing/project HTML parsers
- proposals/AI: prompt rendering with untrusted delimiters, bridge fallback, unsafe direct-provider request settings, OpenAI/Gemini/Claude payload/error behavior
- UI behavior: dashboard tab ARIA state, unsafe direct-control gating, popup admin banner, and keyboard behavior
- entrypoint/policy tests: generated manifest permission policy, unlisted ChatGPT bridge entrypoint, and test-policy guards
- server tests: xUnit v3 tests through the Microsoft Testing Platform runner and ASP.NET Core test host coverage for health/provider endpoints, admin broadcast validation, startup validation, Khamsat freshness policy, and Khamsat scraper behavior through `server/src/Rasid.Server.sln`

## Validation Commands

```bash
npm run test:typecheck
npm run test:unit
npm run test:integration
npm run test:coverage
npm run test:e2e:chrome
npm run test:e2e:firefox
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

For backend release changes, add a publish smoke check:

```bash
dotnet publish server/src/Rasid.Server.csproj -c Release --no-restore -o /tmp/rasid-server-publish
```

## Documentation Consistency Checks

Run focused `rg` scans for unsupported platform references, deleted legacy-doc references, and unresolved editorial markers before release. README and maintained docs should not link to deleted docs or contain unresolved markers.

## Browser E2E

Chrome E2E uses Playwright with a persistent Chromium context and loads `dist/chrome-mv3`.

```bash
npm run build:chrome
npm run test:e2e:chrome
```

The Chrome smoke tests verify service-worker discovery, extension popup/dashboard URLs, fixture-routed content pages, and console-error absence without live marketplace traffic.

Firefox E2E uses the generated `dist/firefox-mv3` output. Because Playwright's extension-loading flow is Chromium-specific, Firefox coverage is split across official Mozilla tooling and Firefox browser rendering:

```bash
npx playwright install firefox
npm run build:firefox
npm run lint:firefox
npm run test:e2e:firefox
```

This validates build output, `web-ext` linting, generated-manifest smoke behavior, a headless `web-ext run` temporary add-on install, and Playwright Firefox rendering of generated popup/dashboard pages with console-error checks.

## Manual Smoke Tests

Chrome and Firefox:

- load generated build
- open popup
- run manual check and diagnostics
- open dashboard
- save settings
- export and import a safe backup
- test notification and sound
- verify content panels on supported platform pages
- verify bridge prompt insertion on an allowed ChatGPT host
- verify admin-message notification/banner behavior when backend/admin broadcast changes

## Remaining Coverage Gaps

Current automated tests still do not fully exercise:

- MV3 service-worker suspension/resume
- browser notification UI
- native browser downloads shelf/UI and Blob URL lifecycle across real download events
- offscreen document creation in Chrome
- Firefox MV3 service-worker lifecycle beyond temporary add-on startup
- full popup/dashboard accessibility tree coverage
- every content-script DOM contribution on every supported platform page kind
- SignalR hub lifecycle in a browser

No tests should call live marketplaces, AI providers, ChatGPT, or external SignalR services.

Related docs:

- [`13-build-test-release.md`](13-build-test-release.md)
- [`15-maintainer-guide.md`](15-maintainer-guide.md)
