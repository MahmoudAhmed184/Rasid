# Source Reference: Platform - Khamsat

Runtime contexts: background monitoring and Khamsat content script.

## `src/platforms/khamsat/index.ts`

Purpose: public Khamsat module barrel.

Exports:

- `khamsatAdapter`
- `createKhamsatMonitoringAdapter`
- `parseKhamsatListingHtml`
- `parseKhamsatProjectHtml`

No functions.

## `src/platforms/khamsat/feeds.ts`

Purpose: Khamsat monitoring feed URL.

Exports:

- `KHAMSAT_FEEDS.requests = "https://khamsat.com/community/requests"`

No functions.

## `src/platforms/khamsat/monitoring.ts`

Purpose: background monitoring adapter factory.

Functions:

| Function                                     | Purpose                             | Inputs                          | Outputs                     | Side effects                                                              |
| -------------------------------------------- | ----------------------------------- | ------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `createKhamsatMonitoringAdapter(htmlParser)` | Creates Khamsat monitoring adapter. | platform monitoring HTML parser | `PlatformMonitoringAdapter` | `resolveFeeds()` returns request feed when Khamsat monitoring is enabled. |

## `src/platforms/khamsat/html-parser.ts`

Purpose: parse fetched Khamsat listing/detail HTML.

Functions:

| Function                         | Purpose                         | Inputs                | Outputs          | Side effects, errors, security                                                                    |
| -------------------------------- | ------------------------------- | --------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `parseDocument(html)`            | Creates DOM document.           | HTML string           | `Document`       | Uses `DOMParser`.                                                                                 |
| `normalizeText(value)`           | Collapses whitespace.           | string/null/undefined | string           | Pure helper.                                                                                      |
| `resolveKhamsatRequestUrl(href)` | Normalizes request URL.         | href/null             | URL/null         | Requires HTTPS `khamsat.com` and request path.                                                    |
| `resolveKhamsatUrl(href)`        | Normalizes general Khamsat URL. | href/null             | URL/null         | Requires HTTPS `khamsat.com`.                                                                     |
| `extractKhamsatRequestId(url)`   | Extracts request ID.            | URL string            | ID/null          | Uses community request path pattern.                                                              |
| `parseKhamsatListingHtml(html)`  | Parses request listing rows.    | HTML string           | `JobRecord[]`    | Deduplicates by ID; extracts title, poster, time, postedAt.                                       |
| `parseKhamsatProjectHtml(html)`  | Parses request detail page.     | HTML string           | partial job/null | Extracts description, client name, publish date, attachments; returns null when no useful fields. |

## `src/platforms/khamsat/adapter.ts`

Purpose: Khamsat content adapter and autofill implementation.

Constants:

- `KHAMSAT_MATCHES = ["https://khamsat.com/*"]`
- `KHAMSAT_AUTOFILLED_CLASS = "rasid-autofilled"`

Functions:

| Function                       | Purpose                                    | Inputs                                 | Outputs               | Side effects, errors, security                                                                                                        |
| ------------------------------ | ------------------------------------------ | -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `isContextValid()`             | Checks extension APIs are available.       | none                                   | boolean               | Catches runtime access errors.                                                                                                        |
| `matchPage(url)`               | Classifies Khamsat page.                   | URL                                    | `PlatformPage`        | Project/request pages use `extractKhamsatProjectId()`.                                                                                |
| `applyProposalAutofill(input)` | Applies queued proposal to reply textarea. | project page, document, autofill draft | `AutofillApplyResult` | Rejects project mismatch; retries when textarea missing; writes value via `setFormControlValue()` with keyboard events; scrolls form. |

Exports:

- `khamsatAdapter`

Adapter UI contribution:

- `khamsat.project-panel`

## `src/platforms/khamsat/selectors.ts`

Purpose: selector registry and helper functions.

Exports:

- `KHAMSAT_SELECTORS`
- `extractKhamsatProjectId()`
- `queryFirst()`
- `queryAll()`

Functions:

| Function                            | Purpose                                           | Inputs          | Outputs       | Side effects                           |
| ----------------------------------- | ------------------------------------------------- | --------------- | ------------- | -------------------------------------- |
| `extractKhamsatProjectId(pathname)` | Extracts request/project ID from path.            | pathname        | string        | Returns empty string when not matched. |
| `queryFirst(root, selectors)`       | Finds first matching element from selector list.  | root, selectors | element/null  | DOM query helper.                      |
| `queryAll(root, selectors)`         | Finds all matching elements across selector list. | root, selectors | element array | DOM query helper.                      |

## `src/platforms/khamsat/content/data.ts`

Purpose: content-script current page data extraction for proposal context.

Functions:

| Function                              | Purpose                                | Inputs                      | Outputs               | Side effects, errors, security      |
| ------------------------------------- | -------------------------------------- | --------------------------- | --------------------- | ----------------------------------- |
| `normalizeText(value)`                | Collapses whitespace.                  | string/null/undefined       | string                | Pure helper.                        |
| `resolveKhamsatUrl(href, baseUrl)`    | Normalizes a Khamsat URL.              | href, base URL              | URL/null              | Host allowlist.                     |
| `getTitle(doc)`                       | Extracts request title.                | document                    | string                | DOM read.                           |
| `getDescription(doc)`                 | Extracts request description.          | document                    | string                | DOM read.                           |
| `getCategory(doc)`                    | Extracts category text.                | document                    | string/undefined      | DOM read.                           |
| `getClientName(doc)`                  | Extracts client name.                  | document                    | string/undefined      | DOM read.                           |
| `getPublishDate(doc)`                 | Extracts publish date.                 | document                    | string/undefined      | DOM read.                           |
| `getAttachments(doc, url)`            | Extracts attachment links.             | document, base URL          | attachments/undefined | Validates Khamsat URLs.             |
| `extractKhamsatProposalSource(input)` | Builds tracked project and AI context. | project page, document, URL | proposal source/null  | Uses DOM extraction and project ID. |

## `src/platforms/khamsat/content/project-panel.ts`

Purpose: injects Khamsat project/request panel.

Types:

- `ProjectPage`
- `MountKhamsatProjectPanelInput`

Functions:

| Function                          | Purpose                         | Inputs                   | Outputs  | Side effects                                                    |
| --------------------------------- | ------------------------------- | ------------------------ | -------- | --------------------------------------------------------------- |
| `getCurrentUrl(doc)`              | Gets document URL.              | document                 | `URL`    | DOM/location read.                                              |
| `createPanelRoot(doc)`            | Creates panel root element.     | document                 | element  | DOM creation.                                                   |
| `mountKhamsatProjectPanel(input)` | Mounts tracking/proposal panel. | page, document, services | disposer | DOM injection, tracking/proposal service calls, toast messages. |

Related docs:

- [`../../09-content-scripts-and-platforms.md`](../../09-content-scripts-and-platforms.md)
- [`../../18-adding-a-platform.md`](../../18-adding-a-platform.md)
