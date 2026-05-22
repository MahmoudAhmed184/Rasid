# Content Scripts And Platforms

The extension ships content scripts for Mostaql, Khamsat, Nafezly, and the ChatGPT bridge.

## Entrypoints

| Entrypoint                              | Matches                                              | Adapter            |
| --------------------------------------- | ---------------------------------------------------- | ------------------ |
| `entrypoints/mostaql.content/index.ts`  | `https://mostaql.com/*`                              | `mostaqlAdapter`   |
| `entrypoints/khamsat.content/index.ts`  | `https://khamsat.com/*`                              | `khamsatAdapter`   |
| `entrypoints/nafezly.content/index.ts`  | `https://nafezly.com/*`                              | `nafezlyAdapter`   |
| `entrypoints/chatgpt-bridge.content.ts` | `https://chatgpt.com/*`, `https://chat.openai.com/*` | ChatGPT bridge app |

## Platform Adapter Contract

Each platform adapter provides:

- `id`
- `displayName`
- `matches`
- `isContextValid()`
- `matchPage({ url, document })`
- `extractProposalSource({ page, document, url })`
- `ui` contributions
- `applyProposalAutofill({ page, document, draft })`

## Content Bootstrap

`bootstrapPlatformContent()`:

- checks `adapter.isContextValid()`
- computes the current page from the URL
- mounts contributions matching that page kind
- retries deferred contributions when the route key changes or the DOM is not ready
- returns through platform-provided disposers where available

`bootstrapPlatformAutofill()`:

- checks current project pages only
- reads queued drafts by platform ID
- ignores stale drafts older than five minutes
- calls platform `applyProposalAutofill()`
- clears drafts after success, not-available, or expiration

## Platform-Specific Notes

Mostaql:

- monitors latest, development, and AI/machine-learning project feeds
- mounts project, message, home, and profile UI contributions
- supports project/message ZIP exports
- supports bid tracker data loading from `https://mostaql.com/dashboard/bids?page=<n>&sort=latest`
- applies proposal, amount, and duration autofill when fields are available

Khamsat:

- monitors `https://khamsat.com/community/requests`
- mounts request/project panel on supported pages
- extracts title, description, category, client name, publish date, and attachments where present
- applies reply textarea autofill

Nafezly:

- monitors `https://nafezly.com/projects`
- mounts project panel when the offer section is present
- extracts project details and client/project metadata where present
- applies proposal autofill through `applyNafezlyProposalAutofill()`

## Selectors And Parser Maintenance

Selectors live in platform-owned files:

- `src/platforms/mostaql/selectors.ts`
- `src/platforms/khamsat/selectors.ts`
- `src/platforms/nafezly/selectors.ts`

Monitoring HTML parsers are separate from page-side content extraction:

- `src/platforms/*/html-parser.ts` parses fetched HTML in background/offscreen flow
- `src/platforms/*/content/*.ts` reads the current page DOM from content scripts

## Security Notes

- Platform URLs are resolved through allowlisted host helpers.
- Background proposal messages validate project URLs before prompt generation.
- Autofill writes form values and dispatches form events; it does not submit marketplace forms.
- Mostaql export escapes generated HTML and validates local/remote asset URLs before packaging.

Related docs:

- [`18-adding-a-platform.md`](18-adding-a-platform.md)
- [`reference/source/platforms-mostaql.md`](reference/source/platforms-mostaql.md)
- [`reference/source/platforms-khamsat.md`](reference/source/platforms-khamsat.md)
- [`reference/source/platforms-nafezly.md`](reference/source/platforms-nafezly.md)
