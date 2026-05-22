# Testing Strategy

## Current Automated Tests

The repository uses a TypeScript-first Vitest suite with WXT's official Vitest plugin plus Playwright scaffolding for Chrome extension smoke tests.

Current automated coverage includes:

- pure entities: AI chat URLs, provider adapters, job identity, platform URL safety, settings clamps
- shared utilities: Arabic/date/duration/number parsing, challenge-page detection, storage modules
- storage/contracts: settings secret migration, backup import/export, proposal state TTL/one-shot behavior, notification payloads, download cleanup records
- background/runtime contracts: runtime message request/response validation and dispatch
- monitoring/realtime/downloads: filters, batch publication, SignalR reducer, ZIP safety
- platform fixtures: Mostaql, Khamsat, and Nafezly listing/project HTML parsers
- proposals/AI: prompt rendering with untrusted delimiters, direct-provider request settings, OpenAI/Gemini/Claude payload/error behavior
- UI behavior: dashboard tab ARIA state and keyboard behavior


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

Firefox browser automation is intentionally limited. The Firefox gate remains:

```bash
npm run build:firefox
npm run lint:firefox
npm run test:e2e:firefox
```

This validates build output, `web-ext` linting, and generated-manifest smoke behavior rather than assuming full Firefox MV3 extension-service-worker E2E support.

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

## Remaining Coverage Gaps

Current automated tests still do not fully exercise:

- MV3 service-worker suspension/resume
- browser notification UI
- native browser downloads shelf/UI and Blob URL lifecycle across real download events
- offscreen document creation in Chrome
- Firefox runtime behavior beyond build/lint/manifest smoke
- full popup/dashboard accessibility tree coverage
- every content-script DOM contribution on every supported platform page kind
- SignalR hub lifecycle in a browser

No tests should call live marketplaces, AI providers, ChatGPT, or external SignalR services.

Related docs:

- [`13-build-test-release.md`](13-build-test-release.md)
- [`15-maintainer-guide.md`](15-maintainer-guide.md)
