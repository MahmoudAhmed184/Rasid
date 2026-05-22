# Source Reference: Platform - Mostaql

Runtime contexts: background monitoring, Mostaql content script, dashboard bid tracker.

## `src/platforms/mostaql/index.ts`

Purpose: public Mostaql module barrel.

Exports:

- `mostaqlAdapter`
- `createMostaqlMonitoringAdapter`
- `parseMostaqlListingHtml`
- `parseMostaqlProjectHtml`

No functions.

## `src/platforms/mostaql/feeds.ts`

Purpose: Mostaql monitoring feed URLs.

Exports:

- `MOSTAQL_FEEDS`

Feed URLs:

- `https://mostaql.com/projects?category=development&sort=latest`
- `https://mostaql.com/projects?category=ai-machine-learning&sort=latest`
- `https://mostaql.com/projects?sort=latest`

No functions.

## `src/platforms/mostaql/monitoring.ts`

Purpose: background monitoring adapter factory.

Functions:

| Function                                     | Purpose                                          | Inputs                          | Outputs | Side effects                                                                             |
| -------------------------------------------- | ------------------------------------------------ | ------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `createMostaqlMonitoringAdapter(htmlParser)` | Creates `PlatformMonitoringAdapter` for Mostaql. | platform monitoring HTML parser | adapter | `resolveFeeds()` reads settings categories; parsing delegates to offscreen/local parser. |

## `src/platforms/mostaql/html-parser.ts`

Purpose: parse fetched Mostaql listing/detail HTML.

Functions:

| Function                         | Purpose                                 | Inputs      | Outputs          | Side effects, errors, security                                                                  |
| -------------------------------- | --------------------------------------- | ----------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `parseDocument(html)`            | Creates DOM document.                   | HTML string | `Document`       | Uses `DOMParser`.                                                                               |
| `resolveMostaqlProjectUrl(href)` | Normalizes project URL.                 | href/null   | URL/null         | Requires HTTPS `mostaql.com` and project path.                                                  |
| `extractMostaqlProjectId(url)`   | Extracts project ID.                    | URL string  | ID/null          | Uses project path pattern.                                                                      |
| `parseMostaqlListingHtml(html)`  | Parses job records from listing HTML.   | HTML string | `JobRecord[]`    | Deduplicates by ID; supports list, table, and link fallback layouts.                            |
| `parseMostaqlProjectHtml(html)`  | Parses detail fields from project HTML. | HTML string | partial job/null | Extracts status, communications, hiring rate, description, duration, budget, registration date. |

## `src/platforms/mostaql/adapter.ts`

Purpose: Mostaql content adapter and autofill implementation.

Important constants:

- `MOSTAQL_MATCHES = ["https://mostaql.com/*"]`
- `MOSTAQL_AUTOFILLED_CLASS = "mostaql-autofilled"`
- `PROJECT_PATH_PATTERN`

Functions:

| Function                          | Purpose                                                    | Inputs                                 | Outputs               | Side effects, errors, security                                                                                         |
| --------------------------------- | ---------------------------------------------------------- | -------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `normalizeText(value, fallback?)` | Trims strings.                                             | unknown, fallback                      | string                | Pure helper.                                                                                                           |
| `normalizeProjectData(value)`     | Normalizes unsafe page extraction output.                  | unknown                                | `MostaqlProjectData`  | Filters attachment objects and normalizes strings.                                                                     |
| `extractProjectData()`            | Reads current Mostaql project data through content helper. | none                                   | `MostaqlProjectData`  | Reads page DOM through imported unsafe extractor wrapper.                                                              |
| `getCurrentProjectId(url)`        | Gets project ID from URL or runtime helper.                | `URL`                                  | string                | URL first, page runtime fallback.                                                                                      |
| `findInput(doc, selectors)`       | Finds first input matching selector list.                  | document, selectors                    | input/null            | DOM query.                                                                                                             |
| `findTextarea(doc, selectors)`    | Finds first textarea matching selector list.               | document, selectors                    | textarea/null         | DOM query.                                                                                                             |
| `findElement(doc, selectors)`     | Finds first element matching selector list.                | document, selectors                    | element/null          | DOM query.                                                                                                             |
| `matchPage(url)`                  | Classifies Mostaql route.                                  | URL                                    | `PlatformPage`        | Supports project, message, profile, home, other.                                                                       |
| `extractProposalSource(input)`    | Builds tracking record and AI context from project page.   | project page, document, URL            | source/null           | Reads DOM-derived metadata; uses budget/duration parsers.                                                              |
| `applyProposalAutofill(input)`    | Applies queued proposal/amount/duration draft.             | project page, document, autofill draft | `AutofillApplyResult` | Rejects project mismatch; retries when fields missing; writes values via `setFormControlValue()`, scrolls target form. |

Exports:

- `mostaqlAdapter`

Adapter UI contributions:

- `mostaql.project`: track button and project export
- `mostaql.message`: message export
- `mostaql.home`: dashboard stats and monitored project widgets
- `mostaql.profile`: profile tools

## `src/platforms/mostaql/selectors.ts`

Purpose: selector registry for Mostaql content UI/autofill.

Exports:

- `MOSTAQL_SELECTORS`
- `queryFirst()`

Functions:

| Function                      | Purpose                                          | Inputs          | Outputs      | Side effects      |
| ----------------------------- | ------------------------------------------------ | --------------- | ------------ | ----------------- |
| `queryFirst(root, selectors)` | Finds first matching element from selector list. | root, selectors | element/null | DOM query helper. |

## `src/platforms/mostaql/bid-tracker.ts`

Purpose: shared Mostaql bid tracker data loader and calculations.

Important constants:

- `MOSTAQL_BID_WINDOW_MS`: 30 days
- `MOSTAQL_BID_DASHBOARD_MAX_PAGES = 20`
- `MOSTAQL_BID_PAGE_TIMEOUT_MS = 10_000`

Functions:

| Function                                                | Purpose                                          | Inputs                  | Outputs           | Side effects, errors, security                           |
| ------------------------------------------------------- | ------------------------------------------------ | ----------------------- | ----------------- | -------------------------------------------------------- |
| `fetchBidTrackerPage(fetchImpl, pageNumber, timeoutMs)` | Fetches one bid dashboard page JSON.             | fetch, page, timeout    | `BidPageResponse` | Uses credentials include and abort timeout.              |
| `parseMostaqlBidRow(renderedHtml)`                      | Parses one rendered bid row.                     | HTML string             | bid item/null     | Uses HTML fragment querying and Mostaql URL validation.  |
| `processBidPage(pageData)`                              | Extracts rows from page response.                | page JSON               | bid items         | Pure parsing over `rendered` rows.                       |
| `fetchMostaqlBidRows(options?)`                         | Fetches paginated bid rows.                      | fetch/max pages/timeout | bid rows          | Caps pages, keeps partial rows on fetch errors.          |
| `parseMostaqlBidDatetime(value)`                        | Parses Mostaql date/time text.                   | unknown                 | `Date`/null       | Handles formatted dashboard date strings.                |
| `normalizeStatusLabel(rawStatus)`                       | Normalizes Arabic status labels.                 | status/null             | string            | Pure helper.                                             |
| `computeMostaqlBidTrackerStats(allBids, options?)`      | Computes 30-day tracker stats.                   | bids, optional now      | stats             | Pure calculation.                                        |
| `computeMostaqlBidStatusStats(allBids, options?)`       | Computes status buckets and recent windows.      | bids, optional now      | status stats      | Pure calculation.                                        |
| `loadMostaqlBidStatusStats(options?)`                   | Fetches bids and computes status stats.          | load options            | status stats      | Network through fetch rows.                              |
| `fetchHomepageStats(fetchImpl)`                         | Fetches Mostaql homepage stats.                  | fetch                   | homepage stats    | Uses credentials include against `https://mostaql.com/`. |
| `loadMostaqlBidTrackerData(fetchImpl = fetch)`          | Loads bids/homepage and computes dashboard data. | fetch                   | tracker data      | Network calls to Mostaql authenticated pages.            |

## `src/platforms/mostaql/content/runtime.ts`

Purpose: legacy/current Mostaql page context helpers.

Functions:

| Function           | Purpose                                          | Inputs | Outputs | Side effects                      |
| ------------------ | ------------------------------------------------ | ------ | ------- | --------------------------------- |
| `isContextValid()` | Checks whether script can access extension APIs. | none   | boolean | Catches runtime access errors.    |
| `getProjectId()`   | Extracts project ID from current URL.            | none   | string  | Reads `window.location.pathname`. |

## `src/platforms/mostaql/content/data.ts`

Purpose: current-page and deep project data extraction.

Functions:

| Function                                      | Purpose                                                           | Inputs                   | Outputs           | Side effects, errors, security                                     |
| --------------------------------------------- | ----------------------------------------------------------------- | ------------------------ | ----------------- | ------------------------------------------------------------------ |
| `resolveMostaqlUrl(href, baseUrl?)`           | Normalizes Mostaql URL.                                           | href, optional base      | URL/null          | Host allowlist.                                                    |
| `resolveMostaqlProjectUrl(href, baseUrl?)`    | Normalizes Mostaql project URL.                                   | href, optional base      | URL/null          | Host/path allowlist.                                               |
| `extractProjectData()`                        | Extracts project page data from DOM.                              | none                     | project page data | Reads current document.                                            |
| `getProjectDescription()`                     | Reads project description text.                                   | none                     | string            | DOM read.                                                          |
| `getBudgetFromPage()`                         | Parses project budget floor.                                      | none                     | number            | DOM read and numeric parse.                                        |
| `fetchDeepProjectData(url)`                   | Fetches and parses a project page for richer data.                | URL                      | remote data/null  | Same-origin/default fetch behavior; validates Mostaql project URL. |
| `extractProjectDetailsFull()`                 | Builds full project details text/data.                            | none                     | object/null       | May call deep fetch.                                               |
| `extractMyProposalFull(externalProjectData?)` | Extracts user's proposal data and combines external project data. | optional project details | object/null       | Reads current page DOM.                                            |

## `src/platforms/mostaql/content/project-sidebar.ts`

Purpose: Mostaql project sidebar buttons for tracking and AI proposal workflows.

Functions:

| Function                                                | Purpose                                              | Inputs                       | Outputs            | Side effects, errors, security                                                         |
| ------------------------------------------------------- | ---------------------------------------------------- | ---------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `createIcon(iconClassName)`                             | Creates icon element.                                | icon class                   | element            | DOM helper.                                                                            |
| `createActionText(text)`                                | Creates action text span.                            | text                         | span               | Text-only.                                                                             |
| `setActionButtonContent(element, iconClassName, label)` | Sets icon/text button content.                       | element, icon, label         | `void`             | DOM update.                                                                            |
| `setInlineIconText(element, iconClassName, text)`       | Writes inline icon and text.                         | element, icon, text          | `void`             | DOM update.                                                                            |
| `setIconOnlyContent(element, iconClassName)`            | Writes icon-only content.                            | element, icon                | `void`             | DOM update.                                                                            |
| `stylePromptMenuButton(button)`                         | Styles prompt menu button.                           | button                       | `void`             | DOM class/style updates.                                                               |
| `injectTrackButton(services)`                           | Mounts tracking/proposal buttons on project sidebar. | platform content services    | disposer/undefined | Reads proposal source, toggles tracking, triggers AI generation/bridge/direct actions. |
| `handleTrackClick(services, btn)`                       | Toggles project tracking.                            | services, button             | `Promise<void>`    | Writes tracking repository and updates UI.                                             |
| `setButtonTracked(btn)` / `setButtonUntracked(btn)`     | Updates track button state.                          | button                       | `void`             | DOM state updates.                                                                     |
| `handleChatGptClick(services, promptId?)`               | Starts proposal generation with selected prompt.     | services, optional prompt ID | `void`             | Calls proposal service; bridge opens ChatGPT, direct queues autofill.                  |

## `src/platforms/mostaql/content/export.ts`

Purpose: Mostaql project/message ZIP export UI and payload creation.

Functions:

| Function                                                     | Purpose                                 | Inputs            | Outputs         | Side effects, errors, security                       |
| ------------------------------------------------------------ | --------------------------------------- | ----------------- | --------------- | ---------------------------------------------------- |
| `createIcon()` / `createActionText()`                        | Build export button DOM.                | icon/text         | elements        | DOM helpers.                                         |
| `setExportButtonContent()` / `setExportButtonLoadingState()` | Update export button UI.                | button and labels | `void`          | DOM updates.                                         |
| `getFilenameFromUrl(urlStr)`                                 | Derives filename from URL path.         | URL string        | filename        | Fallback-safe helper.                                |
| `sanitizeFile(name, fallback)`                               | Sanitizes filename segment.             | name, fallback    | string          | Removes invalid chars.                               |
| `escapeHtml(value)` / `escapeHtmlValue(value, fallback?)`    | Escapes text for generated HTML report. | value             | string          | Prevents executable HTML injection.                  |
| `resolveMostaqlExportUrl(value)`                             | Validates export URL.                   | URL string/null   | URL/null        | Mostaql host allowlist.                              |
| `isSafeLocalAssetPath(value)`                                | Checks safe local asset path.           | string/null       | boolean         | Rejects unsafe path values.                          |
| `resolveReportAssetUrl(localPath, remoteUrl)`                | Chooses safe local or remote asset URL. | local/remote      | URL/null        | Used in generated report assets.                     |
| `injectMessageExporter(downloads)`                           | Mounts message export button.           | download service  | `void`          | Exports chat/message data through ZIP download.      |
| `injectProjectExporter(downloads)`                           | Mounts project export button.           | download service  | `void`          | Exports project details through ZIP download.        |
| `executeExportAll(downloads)`                                | Runs combined export.                   | download service  | `Promise<void>` | Builds ZIP entries and requests background download. |

## `src/platforms/mostaql/content/home.ts`

Purpose: Mostaql home/dashboard injected analytics and monitored projects UI.

Functions:

| Function                                                                                             | Purpose                                 | Inputs           | Outputs            | Side effects                         |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------- | ------------------ | ------------------------------------ |
| `resolveMostaqlUrl(value)` / `resolveMostaqlProjectUrl(value)`                                       | Normalize Mostaql URLs.                 | URL text         | URL/null           | Host/path safety.                    |
| `injectDashboardStats(tracking)`                                                                     | Injects dashboard stats widget.         | tracking service | disposer/undefined | Adds DOM and loads bid status stats. |
| `_injectAnalyticsModal()` / `_openAnalyticsModal()`                                                  | Creates/opens analytics modal.          | none             | `void`             | DOM modal behavior.                  |
| `_injectMonitoredModal(tracking)` / `_openMonitoredModal(tracking)`                                  | Creates/opens monitored projects modal. | tracking service | `void`             | Reads tracked projects.              |
| `_createMonitoredLoadingState()` / `_createMonitoredEmptyState()`                                    | Build monitored state elements.         | none             | element            | DOM helpers.                         |
| `_createMonitoredMetaItem(icon, text)`                                                               | Builds metadata item.                   | icon/text        | list item          | Text rendering.                      |
| `_createMonitoredProjectItem(job)`                                                                   | Builds monitored project card.          | tracked project  | element            | Creates project link.                |
| `_loadMonitoredData(tracking)`                                                                       | Loads tracked projects into modal.      | tracking service | `Promise<void>`    | Repository read and DOM render.      |
| `_createBidStatsBar(config)` / `_createBidStatsColumn(config)` / `_createBidStatsCountdownCard(bid)` | Build bid stats UI.                     | config/bid       | elements           | DOM rendering.                       |
| `_renderBidStats(stats)`                                                                             | Renders bid stats.                      | status stats     | `void`             | DOM update.                          |
| `_startSlotCountdowns()` / `_stopSlotCountdowns()`                                                   | Manage countdown timers.                | none             | `void`             | Timer side effects.                  |
| `_loadBidStats()`                                                                                    | Loads bid status stats.                 | none             | `Promise<void>`    | Network through bid tracker module.  |
| `injectMonitoredProjects(tracking)`                                                                  | Injects monitored projects widget.      | tracking service | disposer/undefined | Adds DOM and modal behavior.         |

## `src/platforms/mostaql/content/prompts.ts`

Purpose: Mostaql page-side prompt modal helpers.

Functions:

| Function                                                | Purpose                           | Inputs                              | Outputs | Side effects                        |
| ------------------------------------------------------- | --------------------------------- | ----------------------------------- | ------- | ----------------------------------- |
| `loadPrompts(services, callback)`                       | Loads prompts and calls callback. | prompt services, callback           | `void`  | Async repository read.              |
| `savePrompt(services, promptData, callback?)`           | Saves prompt.                     | services, draft, optional callback  | `void`  | Async repository write.             |
| `createPromptModal(services, onSave?, existingPrompt?)` | Creates prompt editor modal.      | services, callback, existing prompt | `void`  | DOM modal and prompt save behavior. |

## `src/platforms/mostaql/content/autofill.ts`

Purpose: Mostaql quick bid/autofill helpers.

Functions:

| Function                                                                      | Purpose                                             | Inputs            | Outputs         | Side effects                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------- | ----------------- | --------------- | ----------------------------------- |
| `handleQuickBidClick(proposals)`                                              | Reads project context and queues proposal autofill. | proposal services | `Promise<void>` | Uses generated/quick proposal data. |
| `queueProposalAutofill({ proposals, projectId, proposal, amount, duration })` | Queues Mostaql autofill draft.                      | proposal data     | `Promise<void>` | Writes queued autofill to storage.  |

## `src/platforms/mostaql/content/profile.ts`

Purpose: profile page tools.

Functions:

| Function               | Purpose                        | Inputs | Outputs | Side effects                             |
| ---------------------- | ------------------------------ | ------ | ------- | ---------------------------------------- |
| `injectProfileTools()` | Injects profile-related tools. | none   | `void`  | DOM mutation when profile targets exist. |

Related docs:

- [`../../09-content-scripts-and-platforms.md`](../../09-content-scripts-and-platforms.md)
- [`../../18-adding-a-platform.md`](../../18-adding-a-platform.md)
