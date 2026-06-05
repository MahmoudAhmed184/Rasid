# Source Reference: App Popup

Runtime context: extension action popup.

## `src/app/popup/index.ts`

Purpose: popup controller for stats, manual checks, notifications toggle, source diagnostics, admin-message banner, and dashboard open action.

Key imports:

- popup CSS
- background message request helpers
- monitoring repository type
- admin message storage type

Constants:

- `POPUP_REFRESH_INTERVAL_MS = 30_000`

Types:

- `PopupDependencies`

Functions:

| Function                                     | Purpose                                      | Inputs                          | Outputs                           | Side effects, errors, security                                                     |
| -------------------------------------------- | -------------------------------------------- | ------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| `getElement(id)`                             | Reads an element by ID from document.        | element ID                      | element or `null`                 | DOM helper.                                                                        |
| `createIcon(iconClass)`                      | Creates Font Awesome-style icon element.     | icon class                      | element                           | DOM helper.                                                                        |
| `setButtonContent(button, iconClass, label)` | Replaces button content with icon and label. | button, icon class, label       | `void`                            | Text and DOM update.                                                               |
| `formatLastCheck(lastCheckValue)`            | Formats last check time in Arabic.           | date string/null/undefined      | string                            | Returns fallback when missing/invalid.                                             |
| `updateToggleUi(button, isEnabled)`          | Updates notification toggle button state.    | button, boolean                 | `void`                            | Sets text and active class.                                                        |
| `showPopupStatus(tone, message)`             | Shows connection/status report.              | tone, message                   | `void`                            | Updates live status region.                                                        |
| `hidePopupStatus()`                          | Hides status report.                         | none                            | `void`                            | DOM class update.                                                                  |
| `renderAdminMessageBanner(messages)`         | Renders latest unread backend admin message. | admin message array             | `void`                            | Shows optional link, unread count badge, and banner visibility.                    |
| `loadStats(deps)`                            | Loads monitoring overview into popup.        | monitoring repository           | `Promise<void>`                   | Reads storage through repository, updates counters and last check.                 |
| `syncNotificationToggle(deps)`               | Syncs notification toggle UI from storage.   | monitoring repository           | `Promise<void>`                   | Reads notification state.                                                          |
| `loadAdminMessages()` inner                  | Reads admin messages and renders banner.     | none                            | `Promise<void>`                   | Catches storage errors and logs warning.                                           |
| `dismissAdminMessages()` inner               | Marks admin messages read and hides banner.  | none                            | `Promise<void>`                   | Calls `markAdminMessagesRead()`.                                                   |
| `createPopupController(deps)`                | Creates popup controller.                    | monitoring/admin deps           | controller with `init`, `destroy` | Binds buttons, refresh interval, storage listener, and async states.               |
| `init()` inner                               | Initializes popup.                           | none                            | `Promise<void>`                   | Loads stats, syncs toggle, loads admin messages, starts interval, binds listeners. |
| `destroy()` inner                            | Cleans refresh timer and storage listener.   | none                            | `void`                            | Cleanup on popup unload.                                                           |
| `bootstrapPopup(root, deps)`                 | Creates and initializes popup controller.    | optional document, dependencies | `void`                            | Logs initialization errors and destroys on page unload.                            |

Background messages used:

- `requestCheckNow()`
- `requestDebugFetch()`

Repository methods used:

- `monitoringRepository.getOverview()`
- `monitoringRepository.getNotificationsEnabled()`
- `monitoringRepository.setNotificationsEnabled()`
- `adminMessages.getAdminMessages()`
- `adminMessages.markAdminMessagesRead()`

Browser/extension APIs:

- `browser.tabs.create({ url: browser.runtime.getURL("/dashboard.html") })` opens the dashboard.
- `browser.storage.local.onChanged` refreshes the admin-message banner while the popup is open.

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
