# Module Boundaries

Frelancia uses source ownership boundaries to keep browser entrypoints thin and platform-specific behavior isolated.

## Boundary Table

| Area             | Owns                                                        | Should import from                                                        | Should not own                                            |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| `entrypoints/`   | WXT entrypoint definitions and static imports needed by WXT | `src/app/**`, platform adapters for content matches                       | Business logic, storage normalization, provider logic     |
| `src/app/`       | Composition roots, UI bootstraps, runtime adapters          | `src/features/**`, `src/entities/**`, `src/platforms/**`, `src/shared/**` | Domain rules that can live in features/entities           |
| `src/entities/`  | Domain models, constants, small pure helpers                | Other entity modules                                                      | Browser API calls, feature imports, platform-specific DOM |
| `src/features/`  | Use-case behavior                                           | `src/entities/**`, `src/shared/**`, platform contracts where needed       | WXT entrypoint definitions                                |
| `src/platforms/` | Platform selectors, parsers, adapters, content UI           | `src/entities/**`, `src/features/**` contracts, `src/shared/**` utilities | Cross-platform storage facades                            |
| `src/shared/`    | Browser wrappers, storage modules, generic utilities        | `src/entities/**` for data shapes                                         | Feature orchestration or platform policy                  |

## Entrypoint Rule

Entrypoints should only:

- import required CSS/HTML assets
- create repositories or services
- call app bootstrap functions
- define WXT content/background metadata

Current examples:

- `entrypoints/background.ts` delegates to `createBackgroundApp()` and `registerBackgroundRuntimeMessageBus()`.
- platform content entrypoints delegate to `bootstrapPlatformContent()` and `bootstrapPlatformAutofill()`.
- `entrypoints/chatgpt-bridge.ts` defines an unlisted script and delegates prompt insertion to `initChatgptBridge()`.
- popup/dashboard entrypoints only mount app controllers.

## Repository Surface Rule

`src/app/repositories/browser-repositories.ts` exposes three repository shapes:

- `createBrowserRepositories()` for extension pages
- `createPlatformContentRepositories()` for platform content scripts
- `createChatGptBridgeRepositories()` for the injected ChatGPT bridge script

Content scripts do not receive backup or settings repositories.

## Platform Rule

A shipped platform must update all extension surfaces together:

- platform ID/defaults if needed
- `wxt.config.ts` host permission
- WXT content entrypoint if content UI is shipped
- `src/platforms/<platform>/` adapter/parser/selectors/feeds/monitoring modules
- `src/platforms/registry.ts`
- dashboard/popup UI
- privacy docs
- generated manifest validation
- tests or fixtures where practical

The current shipped platform modules are `mostaql`, `khamsat`, and `nafezly`.

## Shared Utility Rule

Shared utilities should stay generic:

- `src/shared/browser/` wraps browser APIs
- `src/shared/storage/` owns storage schema/modules
- `src/shared/dom/` owns DOM helper primitives
- `src/shared/parsing/` owns generic Arabic/date/numeric parsing helpers
- `src/shared/network/` owns challenge-page detection

Do not put marketplace selectors or AI provider contracts into `src/shared/`.

Related docs:

- [`reference/folder-structure.md`](reference/folder-structure.md)
- [`18-adding-a-platform.md`](18-adding-a-platform.md)
