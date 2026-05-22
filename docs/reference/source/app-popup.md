# Source Reference: App Popup

Runtime context: extension action popup.

## `src/app/popup/index.ts`

Purpose: popup controller for stats, manual checks, notifications toggle, source diagnostics, and dashboard open action.

Key imports:

- popup CSS
- background message request helpers
- monitoring repository type

Constants:

- `POPUP_REFRESH_INTERVAL_MS = 30_000`

Types:

- `PopupDependencies`

Functions:

| Function                                     | Purpose                                      | Inputs                          | Outputs                           | Side effects, errors, security                                     |
| -------------------------------------------- | -------------------------------------------- | ------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `getElement(id)`                             | Reads an element by ID from document.        | element ID                      | element or `null`                 | DOM helper.                                                        |
| `createIcon(iconClass)`                      | Creates Font Awesome-style icon element.     | icon class                      | element                           | DOM helper.                                                        |
| `setButtonContent(button, iconClass, label)` | Replaces button content with icon and label. | button, icon class, label       | `void`                            | Text and DOM update.                                               |
| `formatLastCheck(lastCheckValue)`            | Formats last check time in Arabic.           | date string/null/undefined      | string                            | Returns fallback when missing/invalid.                             |
| `updateToggleUi(button, isEnabled)`          | Updates notification toggle button state.    | button, boolean                 | `void`                            | Sets text and active class.                                        |
| `showPopupStatus(tone, message)`             | Shows connection/status report.              | tone, message                   | `void`                            | Updates live status region.                                        |
| `hidePopupStatus()`                          | Hides status report.                         | none                            | `void`                            | DOM class update.                                                  |
| `loadStats(deps)`                            | Loads monitoring overview into popup.        | monitoring repository           | `Promise<void>`                   | Reads storage through repository, updates counters and last check. |
| `syncNotificationToggle(deps)`               | Syncs notification toggle UI from storage.   | monitoring repository           | `Promise<void>`                   | Reads notification state.                                          |
| `createPopupController(deps)`                | Creates popup controller.                    | monitoring repository           | controller with `init`, `destroy` | Binds buttons, refresh interval, and async action states.          |
| `init()` inner                               | Initializes popup.                           | none                            | `Promise<void>`                   | Loads stats, syncs toggle, starts interval, binds listeners.       |
| `destroy()` inner                            | Cleans refresh timer.                        | none                            | `void`                            | Cleanup on popup unload.                                           |
| `bootstrapPopup(root, deps)`                 | Creates and initializes popup controller.    | optional document, dependencies | `void`                            | Logs initialization errors and destroys on page unload.            |

Background messages used:

- `requestCheckNow()`
- `requestDebugFetch()`

Repository methods used:

- `monitoringRepository.getOverview()`
- `monitoringRepository.getNotificationsEnabled()`
- `monitoringRepository.setNotificationsEnabled()`

Browser/extension APIs:

- `browser.runtime.openOptionsPage()` is used from the popup controller to open dashboard/options.

Failure behavior:

- async actions disable their button while pending
- errors are shown in `connectionReport`
- stats load failures are caught and shown as fallback status

## `src/app/popup/popup.css`

Purpose: popup layout and visual styling.

Runtime role:

- styles Arabic RTL popup shell
- controls stats panel, status indicator, buttons, connection report, footer links

No functions.

Related docs:

- [`../../11-ui-popup-dashboard.md`](../../11-ui-popup-dashboard.md)
- [`app-background.md`](app-background.md)
