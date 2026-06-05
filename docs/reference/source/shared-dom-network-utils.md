# Source Reference: Shared DOM, Network, Parsing, Config

Runtime contexts: shared content/dashboard/popup helpers, background HTML fetch checks, build tooling.

## DOM Utilities

### `src/shared/dom/form-events.ts`

Purpose: set form control values in a way page frameworks can observe.

Functions:

| Function                                        | Purpose                               | Inputs                         | Outputs              | Side effects                                                      |
| ----------------------------------------------- | ------------------------------------- | ------------------------------ | -------------------- | ----------------------------------------------------------------- |
| `getValueDescriptor(control)`                   | Finds native value setter descriptor. | input/textarea control         | descriptor/undefined | Walks prototype chain.                                            |
| `dispatchFormValueEvents(control, options)`     | Dispatches value-change events.       | control, options               | `void`               | Dispatches `input`, `change`, and optional keyboard events.       |
| `setFormControlValue(control, value, options?)` | Sets value and dispatches events.     | control, string value, options | `void`               | Uses native setter when available, adds optional highlight class. |

### `src/shared/dom/html-fragments.ts`

Purpose: query HTML fragments safely for parser helpers.

Functions:

| Function                                      | Purpose                                   | Inputs                          | Outputs      | Side effects      |
| --------------------------------------------- | ----------------------------------------- | ------------------------------- | ------------ | ----------------- |
| `wrapHtmlFragment(html, context)`             | Wraps table-row fragments when needed.    | HTML, context                   | HTML         | Pure helper.      |
| `queryHtmlFragment(html, selector, options?)` | Parses fragment and queries one selector. | HTML, selector, context options | element/null | Uses `DOMParser`. |

### `src/shared/dom/icon-shim.css`

Purpose: CSS shim for icon class rendering in dashboard/content UI.

No functions.

## Network Utilities

### `src/shared/network/challenge-page.ts`

Purpose: detect common upstream challenge/anti-bot pages before parsing marketplace HTML.

Constants:

- `CHALLENGE_PAGE_MARKERS`

Functions:

| Function                       | Purpose                             | Inputs      | Outputs    | Side effects            |
| ------------------------------ | ----------------------------------- | ----------- | ---------- | ----------------------- |
| `detectChallengePage(html)`    | Finds first known challenge marker. | HTML string | match/null | Lowercase text scan.    |
| `looksLikeChallengePage(html)` | Boolean challenge-page helper.      | HTML string | boolean    | Delegates to detection. |

## Parsing Utilities

### `src/shared/parsing/arabic-date.ts`

Purpose: parse Arabic month dates and compute age in days.

Functions:

| Function                                  | Purpose                                                   | Inputs                  | Outputs     | Side effects                         |
| ----------------------------------------- | --------------------------------------------------------- | ----------------------- | ----------- | ------------------------------------ |
| `parseArabicDate(value)`                  | Parses Arabic date text.                                  | string/null/undefined   | `Date`/null | Uses Arabic month map.               |
| `parseJobPostedAt(value)`                 | Parses Khamsat GMT, generic, or Arabic publish date text. | string/null/undefined   | `Date`/null | Used by Khamsat freshness filtering. |
| `calculateArabicDateAgeDays(value, now?)` | Computes days since parsed Arabic date.                   | date text, optional now | number      | Returns `-1` for unparseable input.  |

### `src/shared/parsing/duration.ts`

Purpose: parse duration text into days.

Functions:

| Function                          | Purpose                 | Inputs                | Outputs | Side effects                                   |
| --------------------------------- | ----------------------- | --------------------- | ------- | ---------------------------------------------- |
| `parseDurationDays(durationText)` | Extracts duration days. | string/null/undefined | number  | Returns `0` when no numeric duration is found. |

### `src/shared/parsing/numbers.ts`

Purpose: parse numeric values from Arabic/English text fields.

Functions:

| Function                         | Purpose                             | Inputs                | Outputs      | Side effects     |
| -------------------------------- | ----------------------------------- | --------------------- | ------------ | ---------------- |
| `extractNumericValues(value)`    | Extracts all numeric values.        | string/null/undefined | number array | Internal helper. |
| `parseBudgetFloor(budgetText)`   | Returns first numeric budget value. | text                  | number       | `0` fallback.    |
| `parseBudgetCeiling(budgetText)` | Returns last numeric budget value.  | text                  | number       | `0` fallback.    |
| `parseHiringRate(rateText)`      | Returns first numeric hiring rate.  | text                  | number       | `0` fallback.    |

## Platform Registry And Contracts

### `src/platforms/contracts.ts`

Purpose: shared platform adapter, page, proposal source, content service, monitoring adapter, and disposer contracts.

Exports:

- `PlatformPageKind`
- `PlatformPage`
- `TrackedProjectRecord`
- `PlatformProposalSource`
- `PlatformPromptDraft`
- `AutofillApplyResult`
- `ProposalGenerationResult`
- `PlatformContentServices`
- `PlatformDisposer`
- `PlatformContributionMountResult`
- `PlatformUiContribution`
- `PlatformMonitoringAdapter`
- `PlatformAdapter`

No functions.

### `src/platforms/monitoring-html-parser.ts`

Purpose: bridge platform parser calls through offscreen/local tasks.

Functions:

| Function                                        | Purpose                                | Inputs            | Outputs | Side effects                                         |
| ----------------------------------------------- | -------------------------------------- | ----------------- | ------- | ---------------------------------------------------- |
| `createPlatformMonitoringHtmlParser(offscreen)` | Creates listing/project parser facade. | offscreen manager | parser  | Requests offscreen/local parse tasks by platform ID. |

### `src/platforms/platform-ids.ts`

Purpose: re-export platform ID helpers from entities for platform-facing imports.

No functions defined in this file.

### `src/platforms/registry.ts`

Purpose: current shipped platform module registry.

Registered modules:

- `khamsat`
- `nafezly`
- `mostaql`

Functions:

| Function                                       | Purpose                                                     | Inputs        | Outputs         | Side effects                              |
| ---------------------------------------------- | ----------------------------------------------------------- | ------------- | --------------- | ----------------------------------------- |
| `resolvePlatformModule(platformId)`            | Gets registered platform module or throws.                  | platform ID   | platform module | Throws for unknown/unregistered platform. |
| `getPlatformModules()`                         | Lists registered modules.                                   | none          | module array    | Pure lookup.                              |
| `createPlatformMonitoringAdapters(htmlParser)` | Creates all monitoring adapters.                            | parser facade | adapter array   | Calls each module factory.                |
| `getPlatformMonitoringHtmlParser(platformId)`  | Gets parser functions for offscreen task.                   | platform ID   | parser entry    | Throws for unregistered ID.               |
| `hasEnabledSignalRPlatform(settings)`          | Checks if any enabled registered platform supports SignalR. | settings      | boolean         | Used by realtime desired transport.       |

## Config Files

### `package.json`

Purpose: npm package metadata, scripts, dependencies, and Node engine.

Important scripts:

- `postinstall`
- `dev:chrome`
- `dev:firefox`
- `build`
- `build:chrome`
- `build:firefox`
- `zip:chrome`
- `zip:firefox`
- `format`
- `format:check`
- `lint`
- `lint:fix`
- `lint:ts`
- `test`
- `test:unit`
- `typecheck`
- `lint:firefox`

Runtime dependency:

- `@microsoft/signalr`

Dev dependencies:

- ESLint
- Prettier
- TypeScript
- web-ext
- WXT

### `global.json`

Purpose: .NET SDK selection for the optional backend.

Key settings:

- SDK version `10.0.300`
- `rollForward: latestFeature`
- `allowPrerelease: false`

Release relevance: used by local backend commands and `.github/workflows/server-dotnet.yml`.

### `wxt.config.ts`

Purpose: WXT config and manifest generation.

Constants:

- `icons`
- `hostPermissions`
- `chatBridgeHostPermissions`
- `unsafeDirectAiHostPermissions`
- `sharedPermissions`

Functions:

| Function                               | Purpose                                                                          | Inputs             | Outputs         | Side effects, errors, security                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------- | ------------------ | --------------- | --------------------------------------------------------------------------------------------------------- |
| `isUnsafeDirectAiEnabled()`            | Checks build-time unsafe direct-AI flag.                                         | none               | boolean         | Reads `WXT_ENABLE_UNSAFE_DIRECT_AI`.                                                                      |
| `createRasidManifest(browser)`         | Generates browser-specific manifest fields.                                      | browser target     | manifest object | Emits Frelancia names, required hosts, optional ChatGPT hosts, and unsafe provider hosts only when gated. |
| `stripSignalRInvalidPureAnnotations()` | Vite plugin that removes invalid pure annotations from SignalR ESM utility file. | none               | Vite plugin     | Transform applies only to `node_modules/@microsoft/signalr/dist/esm/Utils.js`.                            |
| `manifest({ browser })`                | Delegates manifest generation.                                                   | WXT browser target | manifest object | Chrome gets `offscreen` and minimum Chrome version; Firefox gets Gecko settings and no `offscreen`.       |

Host permissions are exactly listed in [`../../12-browser-permissions-and-privacy.md`](../../12-browser-permissions-and-privacy.md).

### `tsconfig.json`

Purpose: TypeScript config for extension source.

Key settings:

- extends `.wxt/tsconfig.json`
- `allowJs: true`
- `checkJs: false`
- includes `entrypoints/**/*`, `src/**/*`, `wxt.config.ts`, `.wxt/wxt.d.ts`
- excludes `dist`, `node_modules`

### `tsconfig.test.json`

Purpose: TypeScript config for Node unit tests.

Key settings:

- extends `tsconfig.json`
- emits to `.test-dist`
- `rootDir: "."`
- Node types
- includes `tests/**/*.ts` and `.wxt/wxt.d.ts`

### `eslint.config.mjs`

Purpose: ESLint flat config.

Functions:

| Function                   | Purpose                | Inputs       | Outputs | Side effects                                                        |
| -------------------------- | ---------------------- | ------------ | ------- | ------------------------------------------------------------------- |
| `defineConfig([...])` call | Exports ESLint config. | config array | config  | Ignores generated/dependency files and enforces `curly` for JS/MJS. |

### `.gitignore` and `.prettierignore`

Purpose: ignore generated and out-of-scope local artifacts.

Important `.gitignore` paths:

- `.wxt/`
- `.output/`
- `dist/`
- `node_modules/`
- `.test-dist/`
- `coverage/`
- `test-results/`
- `playwright-report/`
- OS/editor artifacts

Important `.prettierignore` paths:

- `.wxt/`
- `dist/`
- `node_modules/`
- `.test-dist/`
- `coverage/`
- `test-results/`
- `playwright-report/`
- `public/vendor/`
- `package-lock.json`
- `*.min.js`

`server/` is not ignored wholesale by Prettier. Explicit documentation checks can include `server/**/*.md`.

### `server/Directory.Build.props`

Purpose: backend MSBuild policy.

Key settings:

- `AnalysisLevel=latest`
- `EnableNETAnalyzers=true`
- `EnforceCodeStyleInBuild=true`
- `TreatWarningsAsErrors=true`
- `Deterministic=true`
- `ContinuousIntegrationBuild=true` when `CI=true`
- `RestorePackagesWithLockFile=true`
- `RestoreLockedMode=true` when `CI=true`

### `server/Directory.Packages.props`

Purpose: central package management for backend app and test projects.

Key settings:

- `ManagePackageVersionsCentrally=true`
- central versions for HtmlAgilityPack, Swashbuckle, Microsoft.AspNetCore.Mvc.Testing, Microsoft.NET.Test.Sdk, xUnit runner, and xUnit v3

Related lock files:

- `server/src/packages.lock.json`
- `server/tests/Rasid.Server.Tests/packages.lock.json`

### `.github/workflows/server-dotnet.yml`

Purpose: dedicated backend CI workflow.

Triggers:

- `global.json`
- `server/**`
- `.github/workflows/server-dotnet.yml`

Steps:

- checkout
- setup .NET from `global.json`
- `dotnet restore server/src/Rasid.Server.sln --locked-mode`
- `dotnet build server/src/Rasid.Server.sln -c Release --no-restore`
- `dotnet test server/src/Rasid.Server.sln -c Release --no-build`
- `dotnet publish server/src/Rasid.Server.csproj -c Release --no-restore`

### `.github/`

Purpose: repository workflow docs and templates.

Files:

- `.github/CONTRIBUTING.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/server-dotnet.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/SECURITY.md`

These files have no runtime functions.

### `public/icons/`

Purpose: extension icon assets used by generated manifests, popup/dashboard favicon links, and notification icon URLs.

Files:

- `public/icons/icon16.png`
- `public/icons/icon48.png`
- `public/icons/icon128.png`

### `public/platforms/`

Purpose: per-platform notification icon assets.

Files:

- `public/platforms/Mostql.png`
- `public/platforms/Khamsat.png`
- `public/platforms/Nafezly.png`

Related docs:

- [`../../13-build-test-release.md`](../../13-build-test-release.md)
- [`folder-structure.md`](../folder-structure.md)
