# Source Reference: Entrypoints

Runtime contexts: WXT background, content scripts, extension pages, and Chrome offscreen page.

Automated coverage:

- `tests/e2e/chrome/extension-smoke.spec.ts` loads the built Chrome extension with Playwright and smokes service worker, popup, dashboard, and a fixture-routed content page.
- `tests/e2e/firefox/manifest-smoke.test.ts` keeps Firefox coverage to build/lint/generated-manifest smoke unless full Firefox extension E2E becomes practical.

## `entrypoints/background.ts`

Purpose: WXT background entrypoint.

Key imports:

- `browser` from `wxt/browser`
- `defineBackground`
- `createBackgroundApp`
- `registerBackgroundRuntimeMessageBus`
- `restrictBrowserSessionStorageToTrustedContexts`

Key export: default WXT background definition.

Functions:

| Function                           | Purpose                                                       | Inputs                                       | Output | Side effects, errors, security                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------- | -------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runTask(label, task)`             | Runs an async background task and logs failures with a label. | `label: string`, `task: () => Promise<void>` | `void` | Catches and logs errors; prevents unhandled promise rejections.                                                                                                 |
| `main()` inside `defineBackground` | Creates the background app and registers runtime listeners.   | none                                         | `void` | Restricts session storage access, registers notification/download handlers, runtime lifecycle handlers, alarm handler, message bus, and worker-start bootstrap. |

Browser APIs touched: `runtime.onInstalled`, `runtime.onStartup`, `alarms.onAlarm`.

## `entrypoints/chatgpt-bridge.content.ts`

Purpose: WXT content script for ChatGPT bridge prompt insertion.

Key imports:

- `defineContentScript`
- `createChatGptBridgeRepositories`
- `initChatgptBridge`

Key export: default WXT content script definition.

Runtime configuration:

- matches `https://chatgpt.com/*`
- matches `https://chat.openai.com/*`
- `runAt: "document_idle"`

Functions:

| Function                              | Purpose                                                      | Inputs | Output | Side effects, errors, security                                                         |
| ------------------------------------- | ------------------------------------------------------------ | ------ | ------ | -------------------------------------------------------------------------------------- |
| `main()` inside `defineContentScript` | Creates bridge-only repositories and initializes bridge app. | none   | `void` | Gives bridge code only `proposalRepository`; no backup/settings repository is exposed. |

## Platform Content Entrypoints

Files:

- `entrypoints/mostaql.content/index.ts`
- `entrypoints/khamsat.content/index.ts`
- `entrypoints/nafezly.content/index.ts`

Purpose: WXT content scripts for supported platforms.

Common key imports:

- `defineContentScript`
- platform CSS
- `bootstrapPlatformContent`
- `bootstrapPlatformAutofill`
- `createPlatformContentServices`
- `createPlatformContentRepositories`
- platform adapter

Runtime configuration:

| File                                   | Match source             | Run timing      |
| -------------------------------------- | ------------------------ | --------------- |
| `entrypoints/mostaql.content/index.ts` | `mostaqlAdapter.matches` | `document_idle` |
| `entrypoints/khamsat.content/index.ts` | `khamsatAdapter.matches` | `document_idle` |
| `entrypoints/nafezly.content/index.ts` | `nafezlyAdapter.matches` | `document_idle` |

Functions:

| Function                                     | Purpose                                                                                        | Inputs | Output | Side effects, errors, security                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `main()` inside each platform content script | Creates narrowed content repositories, bootstraps platform UI, and bootstraps queued autofill. | none   | `void` | Exposes only prompt/proposal/tracking repositories to content services; mounts only the imported platform adapter. |

CSS assets:

- `entrypoints/mostaql.content/style.css`: Mostaql injected UI styles, modal/toast/autofill/track-button styles, reduced-motion overrides.
- `entrypoints/khamsat.content/style.css`: Khamsat injected panel/autofill styles and reduced-motion overrides.
- `entrypoints/nafezly.content/style.css`: Nafezly injected panel/autofill styles and reduced-motion overrides.

## `entrypoints/popup/index.html`

Purpose: Arabic RTL popup shell.

Runtime context: extension action popup.

Important elements:

- `todayCount`
- `totalSeen`
- `lastCheck`
- `open-dashboard-btn`
- `checkNowBtn`
- `toggleNotificationsBtn`
- `checkConnectionBtn`
- `connectionReport`

No functions. It loads `./main.ts`.

## `entrypoints/popup/main.ts`

Purpose: popup mount entrypoint.

Key imports:

- `createBrowserRepositories`
- `bootstrapPopup`

Functions:

| Function  | Purpose                                                      | Inputs | Output | Side effects, errors, security                                                         |
| --------- | ------------------------------------------------------------ | ------ | ------ | -------------------------------------------------------------------------------------- |
| `mount()` | Creates browser repositories and boots the popup controller. | none   | `void` | Reads/writes through `MonitoringRepository`; registers DOM behavior in extension page. |

DOMContentLoaded behavior: waits for `DOMContentLoaded` when the document is still loading, otherwise mounts immediately.

## `entrypoints/dashboard/index.html`

Purpose: Arabic RTL dashboard/options page.

Runtime context: extension page opened through `options_ui`.

Important sections:

- overview
- bids tracker
- filters
- prompts
- proposals
- settings
- global monitoring switch
- backup export/import controls

No functions. It loads `./main.ts`.

## `entrypoints/dashboard/main.ts`

Purpose: dashboard mount entrypoint.

Key imports:

- `createBrowserRepositories`
- `bootstrapDashboard`

Functions:

| Function  | Purpose                                                               | Inputs | Output | Side effects, errors, security                                                                |
| --------- | --------------------------------------------------------------------- | ------ | ------ | --------------------------------------------------------------------------------------------- |
| `mount()` | Creates full browser repositories and boots the dashboard controller. | none   | `void` | Dashboard receives backup, monitoring, prompt, proposal, settings, and tracking repositories. |

DOMContentLoaded behavior: waits for `DOMContentLoaded` when needed, otherwise mounts immediately.

## `entrypoints/offscreen/index.html`

Purpose: Chrome-only offscreen document.

Runtime context: Chrome MV3 offscreen page.

Important metadata:

- `meta name="wxt.include" content='["chrome"]'`
- loads `./main.ts`

No functions.

## `entrypoints/offscreen/main.ts`

Purpose: starts the offscreen task listener.

Key import: `initOffscreen`.

Functions:

| Function                         | Purpose                             | Inputs | Output | Side effects, errors, security                                        |
| -------------------------------- | ----------------------------------- | ------ | ------ | --------------------------------------------------------------------- |
| top-level `initOffscreen()` call | Initializes offscreen RPC listener. | none   | `void` | Registers `browser.runtime.onMessage` listener inside offscreen page. |

Related docs:

- [`../07-runtime-messaging.md`](../../07-runtime-messaging.md)
- [`app-background.md`](app-background.md)
- [`features-realtime-notifications-downloads.md`](features-realtime-notifications-downloads.md)
