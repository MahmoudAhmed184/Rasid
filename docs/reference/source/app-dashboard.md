# Source Reference: App Dashboard

Runtime context: extension dashboard/options page.

## `src/app/dashboard/index.ts`

Purpose: dashboard composition and lifecycle.

Key imports: dashboard CSS, icon shim CSS, bid tracker, connection panel, prompt manager, tracked projects panel, settings form, tabs, repository types.

Exports:

- `bootstrapDashboard()`

Functions:

| Function                         | Purpose                                                  | Inputs                      | Outputs             | Side effects, errors, security                                 |
| -------------------------------- | -------------------------------------------------------- | --------------------------- | ------------------- | -------------------------------------------------------------- |
| `getElement(id)`                 | Reads an element by ID from global document.             | element ID                  | element or `null`   | DOM lookup helper.                                             |
| `updateOverviewStats(stats)`     | Updates overview statistic text.                         | stats-like object           | `void`              | Writes text content only.                                      |
| `createDashboardApp(root, deps)` | Creates dashboard subcontrollers and lifecycle API.      | document, repositories      | `{ init, destroy }` | Boots connection, tracking, settings, prompts, bids, and tabs. |
| `loadData()` inside app          | Loads overview, tracked projects, and proposal template. | none                        | `Promise<void>`     | Reads repositories and updates DOM controls.                   |
| `init()` inside app              | Initializes dashboard once.                              | none                        | `Promise<void>`     | Binds controllers and loads data.                              |
| `destroy()` inside app           | Cleans up dashboard timers/controllers.                  | none                        | `void`              | Calls settings, bid tracker, and tab destroy functions.        |
| `bootstrapDashboard(root, deps)` | Creates and initializes dashboard app.                   | optional root, dependencies | `void`              | Logs initialization errors and destroys app on page unload.    |

## `src/app/dashboard/settings.ts`

Purpose: settings, backup, notification-test, sound-test, global toggle, and proposal-template form controller.

Important constants:

- `PLATFORM_FIELD_IDS`: Mostaql, Khamsat, Nafezly dashboard field IDs.
- `SUPPORTED_BACKUP_SCHEMA_VERSION = 1`
- `MAX_BACKUP_IMPORT_BYTES = 5 * 1024 * 1024`
- `BACKUP_RECOGNIZED_KEYS`: accepted backup content keys.
- `LEGACY_SENSITIVE_BACKUP_KEYS`: `aiApiKeySecret`, `pendingChatGptPrompt`.

Exports:

- `createSettingsForm()`

Functions:

| Function                                        | Purpose                                               | Inputs                                         | Outputs                                   | Side effects, errors, security                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `isRecord(value)`                               | Checks object payloads.                               | unknown                                        | type guard                                | Used by backup validation.                                                                                      |
| `countArrayItems(value)`                        | Counts array values safely.                           | unknown                                        | number                                    | Used in backup preview.                                                                                         |
| `countObjectItems(value)`                       | Counts object values safely.                          | unknown                                        | number                                    | Used in backup preview.                                                                                         |
| `createSettingsForm(root, options)`             | Creates the dashboard settings controller.            | document, repositories, optional save callback | controller with `load`, `bind`, `destroy` | Owns settings DOM reads/writes, validation, backup import/export, test notification/sound, and status messages. |
| `getField(id)` inner                            | Returns typed form field.                             | ID                                             | form field or `null`                      | Avoids unsafe casts.                                                                                            |
| `getButton(id)` inner                           | Returns typed button.                                 | ID                                             | button or `null`                          | Used for busy states.                                                                                           |
| `getFieldValue(id)` inner                       | Reads checkbox/value state.                           | ID                                             | boolean/string/undefined                  | Handles checkboxes specially.                                                                                   |
| `setFieldValue(id, value)` inner                | Writes checkbox/value state.                          | ID, value                                      | `void`                                    | Updates dashboard controls.                                                                                     |
| `parseNumberValue(value)` inner                 | Parses numeric field values.                          | unknown                                        | number                                    | Returns `0` for non-finite values.                                                                              |
| `showSaveStatus(tone, message, options?)` inner | Shows live dashboard save/action status.              | tone, text, optional persistence               | `void`                                    | Updates `role=status` area and timer.                                                                           |
| `setButtonBusy(button, busy)` inner             | Toggles pending state.                                | button, boolean                                | `void`                                    | Sets disabled and `aria-busy`.                                                                                  |
| `updateAiFieldsVisibility(mode)` inner          | Shows/hides bridge/direct AI fields.                  | AI execution mode                              | `void`                                    | Updates required attributes and hidden state.                                                                   |
| `clearFieldValidity(field)` inner               | Clears custom validity and invalid markers.           | field                                          | `void`                                    | UI validation state cleanup.                                                                                    |
| `validateAiChatUrl(field)` inner                | Validates allowed ChatGPT bridge URL.                 | input field                                    | boolean                                   | Rejects non-HTTPS or unsupported hosts.                                                                         |
| `validateDirectAiFields()` inner                | Validates model/API-key in direct mode.               | none                                           | boolean                                   | Requires model and API key only when direct mode is selected.                                                   |
| `validateSettingsForm()` inner                  | Runs native and custom validation.                    | none                                           | boolean                                   | Prevents invalid settings save.                                                                                 |
| `apply(settings)` inner                         | Applies settings into DOM fields.                     | settings patch                                 | `void`                                    | Writes form state and AI visibility.                                                                            |
| `collectSettings(baseSettings)` inner           | Builds an `ExtensionSettings` object from form state. | base settings                                  | `ExtensionSettings`                       | Reads platform toggles and filters.                                                                             |
| `saveAll(button?)` inner                        | Saves settings and proposal template.                 | optional button                                | `Promise<void>`                           | Calls repositories, updates alarm through background message, reports errors.                                   |
| `toggleSystemEnabled(input)` inner              | Saves global enable/disable switch.                   | checkbox                                       | `Promise<void>`                           | Rolls back UI on failure.                                                                                       |
| `exportBackup(button?)` inner                   | Downloads JSON backup.                                | optional button                                | `Promise<void>`                           | Creates Blob URL and temporary anchor; revokes URL.                                                             |
| `createBackupImportSummary(snapshot)` inner     | Validates and summarizes backup payload.              | unknown parsed JSON                            | summary string                            | Rejects unsupported schema/unrecognized content; flags sensitive legacy fields.                                 |
| `isSupportedBackupFile(file)` inner             | Checks selected backup file size/type.                | `File`                                         | boolean                                   | Enforces max 5 MiB size.                                                                                        |
| `importBackup(event)` inner                     | Reads, previews, confirms, and imports backup.        | input change event                             | `void`                                    | Uses FileReader, `window.confirm`, repository import, status messages.                                          |
| `bind()` inner                                  | Registers dashboard settings listeners.               | none                                           | `void`                                    | Adds click/change listeners for settings, backup, tests, and AI mode.                                           |
| `destroy()` inner                               | Clears status timer.                                  | none                                           | `void`                                    | Cleanup for dashboard teardown.                                                                                 |

Browser APIs touched: `Blob`, `URL.createObjectURL`, `URL.revokeObjectURL`, `FileReader`, `window.confirm`, background runtime messages.

## `src/app/dashboard/prompts.ts`

Purpose: dashboard prompt manager and accessible prompt editor modal.

Exports:

- `createPromptManager()`

Functions:

| Function                                            | Purpose                                               | Inputs                                         | Outputs                                   | Side effects, errors, security                         |
| --------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `createPromptManager(root, options)`                | Creates prompt list/modal controller.                 | document, prompt repository, optional callback | controller with `load`, `bind`, `destroy` | Reads/writes prompt templates and manages modal focus. |
| `createPromptEmptyState()` inner                    | Creates empty prompt message.                         | none                                           | paragraph                                 | Text-only DOM creation.                                |
| `createIconButton(prompt, index, ...)` inner        | Creates edit/delete icon button.                      | prompt, index, icon/action metadata            | button                                    | Adds accessible label.                                 |
| `createPromptCard(prompt, index)` inner             | Builds one prompt card.                               | prompt, index                                  | card                                      | Renders prompt text with `textContent`.                |
| `setBackgroundInert(isInert)` inner                 | Marks dashboard background inert while modal is open. | boolean                                        | `void`                                    | Uses `inert` when available and `aria-hidden`.         |
| `getFocusableModalElements()` inner                 | Finds modal focus targets.                            | none                                           | elements                                  | Used for focus trap.                                   |
| `clearFieldError()` / `setFieldError()` inner       | Manage prompt validation messages.                    | field and error elements                       | `void`                                    | Sets ARIA invalid/describedby.                         |
| `clearModalValidation()` inner                      | Clears modal errors/status.                           | none                                           | `void`                                    | UI state cleanup.                                      |
| `showModalStatus(message)` inner                    | Shows prompt modal status.                            | text                                           | `void`                                    | Live/status UI.                                        |
| `focusInitialModalField()` inner                    | Focuses initial modal field.                          | none                                           | `void`                                    | Accessibility behavior.                                |
| `openModal(prompt?, index?)` / `closeModal()` inner | Opens/closes modal and restores focus.                | optional prompt/index                          | `void`                                    | Traps/restores focus, handles backdrop state.          |
| `editPrompt(index)` inner                           | Loads and opens selected prompt.                      | index                                          | `Promise<void>`                           | Reads repository.                                      |
| `deletePrompt(index)` inner                         | Deletes prompt after confirmation.                    | index                                          | `Promise<void>`                           | Uses native confirm and repository remove.             |
| `saveFromModal()` inner                             | Validates and saves prompt.                           | none                                           | `Promise<void>`                           | Trims fields, saves repository, rerenders.             |
| `handleModalKeydown(event)` inner                   | Handles Escape and Tab trap.                          | keyboard event                                 | `void`                                    | Prevents focus escape.                                 |
| `render(prompts)` inner                             | Renders prompt cards.                                 | prompt array                                   | `void`                                    | Text-only DOM updates.                                 |
| `bind()` inner                                      | Registers prompt manager listeners.                   | none                                           | `void`                                    | Adds modal/list/input event handlers.                  |

## `src/app/dashboard/bid-tracker.ts`

Purpose: dashboard Mostaql bid tracker UI.

Important constants:

- `BID_STATUS_CONFIG`: Arabic status labels, icon classes, and colors.

Exports:

- `createBidTracker()`

Functions:

| Function                                               | Purpose                                        | Inputs                        | Outputs                                          | Side effects, errors, security                                                       |
| ------------------------------------------------------ | ---------------------------------------------- | ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `createIcon(doc, iconClass)`                           | Creates icon element.                          | document, CSS class           | element                                          | DOM helper.                                                                          |
| `createStateMessage(doc, options)`                     | Creates loading/error/empty state message.     | document, state options       | element                                          | Text-only state rendering.                                                           |
| `createHelpText(doc, message)`                         | Creates help paragraph.                        | document, message             | element                                          | Text-only DOM rendering.                                                             |
| `createBidTracker(root)`                               | Creates bid tracker controller.                | document                      | controller with `initOnce`, `refresh`, `destroy` | Fetches Mostaql bid data, renders summary/status/timeline, manages countdown timers. |
| `resetSummaryCards()` inner                            | Resets stat cards.                             | none                          | `void`                                           | DOM text update.                                                                     |
| `showLoadingState()` / `showErrorState(message)` inner | Renders loading/error state.                   | optional message              | `void`                                           | Error state includes retry button.                                                   |
| `getCountdownColor(percentage)` inner                  | Maps age percentage to CSS color.              | number                        | color string                                     | Pure helper.                                                                         |
| `formatCountdown(msLeft)` inner                        | Formats countdown in Arabic.                   | milliseconds                  | string                                           | Pure helper.                                                                         |
| `getStatusCssClass(status)` inner                      | Maps bid status to CSS class.                  | status string/null            | string                                           | Pure helper.                                                                         |
| `renderSummary(stats, homepageStats)` inner            | Updates summary cards.                         | tracker stats, homepage stats | `void`                                           | DOM text update.                                                                     |
| `renderStatusCards(byStatus, total)` inner             | Renders status distribution.                   | status counts, total          | `void`                                           | DOM creation with text.                                                              |
| `renderTimeline(bids)` inner                           | Renders bid timeline.                          | bids                          | `void`                                           | Creates external links to Mostaql project URLs.                                      |
| `clearCountdowns()` / `startCountdowns()` inner        | Manages countdown interval.                    | none                          | `void`                                           | Timer side effects.                                                                  |
| `load()` inner                                         | Loads and renders bid data.                    | none                          | `Promise<void>`                                  | Calls `loadMostaqlBidTrackerData()`, catches errors.                                 |
| `initOnce()` / `refresh()` inner                       | Initializes or refreshes tracker.              | none                          | `Promise<void>`                                  | Prevents duplicate initial load.                                                     |
| `bind()` inner                                         | Registers refresh and timeline link listeners. | none                          | `void`                                           | Opens links in new tab through normal anchor behavior.                               |
| `destroy()` inner                                      | Clears timers.                                 | none                          | `void`                                           | Cleanup.                                                                             |

## `src/app/dashboard/connection.ts`

Purpose: dashboard connection status panel.

Functions:

| Function                                          | Purpose                   | Inputs                                | Outputs                   | Side effects, errors, security                              |
| ------------------------------------------------- | ------------------------- | ------------------------------------- | ------------------------- | ----------------------------------------------------------- |
| `setStatusIcon(root, container, tone, iconClass)` | Updates connection icon.  | document, container, tone, icon class | `void`                    | Replaces DOM icon state.                                    |
| `createConnectionStatusPanel(root, deps)`         | Creates panel controller. | document, monitoring repository       | controller with `refresh` | Reads monitoring overview and updates connection status UI. |

## `src/app/dashboard/projects.ts`

Purpose: renders tracked projects in dashboard overview.

Functions:

| Function                                    | Purpose                          | Inputs                        | Outputs                          | Side effects, errors, security                                                    |
| ------------------------------------------- | -------------------------------- | ----------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `createTrackedProjectsPanel(root, deps)`    | Creates tracked projects panel.  | document, proposal repository | controller with `render`, `bind` | Renders up to seven projects and queues autofill from quick template.             |
| `createMetaItem(iconClassName, text)` inner | Creates project metadata item.   | icon class, text              | `li`                             | Text-only rendering.                                                              |
| `createEmptyState()` inner                  | Creates empty state.             | none                          | paragraph                        | Text-only rendering.                                                              |
| `createTrackedProjectCard(job)` inner       | Builds one tracked project card. | tracked project               | card                             | Uses `resolvePlatformId()` and `getPlatformDisplayName()`; creates external link. |
| `bind()` inner                              | Handles apply-autofill click.    | none                          | `void`                           | Queues autofill draft with quick proposal template.                               |
| `render(jobs)` inner                        | Renders panel list.              | tracked projects              | `void`                           | Sort order handled by caller.                                                     |

## `src/app/dashboard/tabs.ts`

Purpose: accessible dashboard tab controller.

Functions:

| Function                                         | Purpose                             | Inputs                      | Outputs                                          | Side effects, errors, security                                          |
| ------------------------------------------------ | ----------------------------------- | --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| `createTabController(root, options)`             | Creates tab controller.             | document, optional callback | controller with `bind`, `activateTab`, `destroy` | Updates `hidden`, active classes, `aria-selected`, and roving tabindex. |
| `activateTab(tabId)` inner                       | Activates panel and tab.            | tab ID                      | `void`                                           | Calls `onTabActivated`.                                                 |
| `activateFromButton(item)` inner                 | Activates from nav button dataset.  | button                      | `void`                                           | Ignores missing tab IDs.                                                |
| `focusRelativeTab(currentItem, direction)` inner | Arrow-key focus movement.           | button, direction           | `void`                                           | Wraps around tab list.                                                  |
| `focusEdgeTab(edge)` inner                       | Home/End focus movement.            | `first`/`last`              | `void`                                           | Focuses edge tab.                                                       |
| `bind()` inner                                   | Registers click/keyboard listeners. | none                        | `void`                                           | Implements Arrow/Home/End behavior.                                     |

## CSS Files

| File                                   | Purpose                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/app/dashboard/dashboard.css`      | Main dashboard layout, RTL styling, controls, cards, tabs, settings, prompt modal, backup UI. |
| `src/app/dashboard/dashboard-bids.css` | Bid tracker status/timeline/countdown styling.                                                |

Related docs:

- [`../../11-ui-popup-dashboard.md`](../../11-ui-popup-dashboard.md)
- [`features-proposals.md`](features-proposals.md)
