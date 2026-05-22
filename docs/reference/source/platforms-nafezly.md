# Source Reference: Platform - Nafezly

Runtime contexts: background monitoring and Nafezly content script.

## `src/platforms/nafezly/index.ts`

Purpose: public Nafezly module barrel.

Exports:

- `nafezlyAdapter`
- `createNafezlyMonitoringAdapter`
- `parseNafezlyListingHtml`
- `parseNafezlyProjectHtml`

No functions.

## `src/platforms/nafezly/feeds.ts`

Purpose: Nafezly monitoring feed URL.

Exports:

- `NAFEZLY_FEEDS.projects = "https://nafezly.com/projects"`

No functions.

## `src/platforms/nafezly/monitoring.ts`

Purpose: background monitoring adapter factory.

Functions:

| Function                                     | Purpose                             | Inputs                          | Outputs                     | Side effects                                                               |
| -------------------------------------------- | ----------------------------------- | ------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `createNafezlyMonitoringAdapter(htmlParser)` | Creates Nafezly monitoring adapter. | platform monitoring HTML parser | `PlatformMonitoringAdapter` | `resolveFeeds()` returns projects feed when Nafezly monitoring is enabled. |

## `src/platforms/nafezly/html-parser.ts`

Purpose: parse fetched Nafezly listing/detail HTML.

Functions:

| Function                               | Purpose                                  | Inputs                 | Outputs          | Side effects, errors, security                                                     |
| -------------------------------------- | ---------------------------------------- | ---------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `parseDocument(html)`                  | Creates DOM document.                    | HTML string            | `Document`       | Uses `DOMParser`.                                                                  |
| `normalizeText(value)`                 | Collapses whitespace.                    | string/null/undefined  | string           | Pure helper.                                                                       |
| `resolveNafezlyProjectUrl(href)`       | Normalizes project URL.                  | href/null              | URL/null         | Requires HTTPS `nafezly.com` and project path.                                     |
| `extractNafezlyProjectId(url)`         | Extracts project ID.                     | URL string             | ID/null          | Uses `/project/<id>` path.                                                         |
| `findSectionContent(doc, headingText)` | Finds detail section by heading.         | document, heading text | element/null     | DOM query helper.                                                                  |
| `parseDetailRows(section)`             | Converts detail rows to label/value map. | parent node            | record           | DOM query helper.                                                                  |
| `parseNafezlyListingHtml(html)`        | Parses project cards.                    | HTML string            | `JobRecord[]`    | Deduplicates by ID; extracts title, preview, poster, budget, duration, bids, time. |
| `parseNafezlyProjectHtml(html)`        | Parses detail page.                      | HTML string            | partial job/null | Extracts description, status, date, duration, budget, bids, client, tags.          |

## `src/platforms/nafezly/adapter.ts`

Purpose: Nafezly content adapter.

Constants:

- `NAFEZLY_MATCHES = ["https://nafezly.com/*"]`

Functions:

| Function           | Purpose                              | Inputs | Outputs        | Side effects, errors, security                 |
| ------------------ | ------------------------------------ | ------ | -------------- | ---------------------------------------------- |
| `isContextValid()` | Checks extension APIs are available. | none   | boolean        | Catches runtime access errors.                 |
| `matchPage(url)`   | Classifies Nafezly page.             | URL    | `PlatformPage` | Project pages use `extractNafezlyProjectId()`. |

Exports:

- `nafezlyAdapter`

Adapter behavior:

- `extractProposalSource()` delegates to `extractNafezlyProposalSource()`
- `applyProposalAutofill()` delegates to `applyNafezlyProposalAutofill()`
- UI contribution `nafezly.project-panel` waits for offer section before mounting

## `src/platforms/nafezly/selectors.ts`

Purpose: selector registry and DOM query helpers.

Exports:

- `NAFEZLY_SELECTORS`
- `extractNafezlyProjectId()`
- `queryFirst()`
- `queryAll()`

Functions:

| Function                            | Purpose                                          | Inputs          | Outputs       | Side effects                           |
| ----------------------------------- | ------------------------------------------------ | --------------- | ------------- | -------------------------------------- |
| `extractNafezlyProjectId(pathname)` | Extracts project ID from path.                   | pathname        | string        | Returns empty string when not matched. |
| `queryFirst(root, selectors)`       | Finds first matching element from selector list. | root, selectors | element/null  | DOM query helper.                      |
| `queryAll(root, selector)`          | Finds all elements for one selector.             | root, selector  | element array | DOM query helper.                      |

## `src/platforms/nafezly/content/data.ts`

Purpose: content-script current page data extraction for proposal context.

Functions:

| Function                              | Purpose                                | Inputs                      | Outputs              | Side effects                         |
| ------------------------------------- | -------------------------------------- | --------------------------- | -------------------- | ------------------------------------ |
| `normalizeText(value)`                | Collapses whitespace.                  | string/null/undefined       | string               | Pure helper.                         |
| `findSection(doc, headingText)`       | Finds page section by heading.         | document, heading text      | element/null         | DOM query helper.                    |
| `parseDetailRows(section)`            | Converts detail rows to record.        | parent node                 | record               | DOM query helper.                    |
| `getTitle(doc)`                       | Extracts project title.                | document                    | string               | DOM read.                            |
| `getDescription(doc)`                 | Extracts project description.          | document                    | string               | DOM read.                            |
| `extractNafezlyProposalSource(input)` | Builds tracked project and AI context. | project page, document, URL | proposal source/null | Uses detail rows and DOM extraction. |

## `src/platforms/nafezly/content/autofill.ts`

Purpose: Nafezly proposal autofill.

Functions:

| Function                              | Purpose                                | Inputs                        | Outputs               | Side effects, errors, security                                                               |
| ------------------------------------- | -------------------------------------- | ----------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `getAuthState(doc)`                   | Detects logged-in state from page DOM. | document                      | boolean               | DOM read.                                                                                    |
| `applyNafezlyProposalAutofill(input)` | Applies queued proposal draft.         | project page, document, draft | `AutofillApplyResult` | Rejects project mismatch; retries when form not ready; writes form value through DOM helper. |

## `src/platforms/nafezly/content/project-panel.ts`

Purpose: injects Nafezly project panel.

Types:

- `ProjectPage`
- `MountNafezlyProjectPanelInput`

Functions:

| Function                          | Purpose                         | Inputs                   | Outputs  | Side effects                                                    |
| --------------------------------- | ------------------------------- | ------------------------ | -------- | --------------------------------------------------------------- |
| `getCurrentUrl(doc)`              | Gets document URL.              | document                 | `URL`    | DOM/location read.                                              |
| `createPanelRoot(doc)`            | Creates panel root element.     | document                 | element  | DOM creation.                                                   |
| `mountNafezlyProjectPanel(input)` | Mounts tracking/proposal panel. | page, document, services | disposer | DOM injection, tracking/proposal service calls, toast messages. |

Related docs:

- [`../../09-content-scripts-and-platforms.md`](../../09-content-scripts-and-platforms.md)
- [`../../18-adding-a-platform.md`](../../18-adding-a-platform.md)
