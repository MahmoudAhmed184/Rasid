# UI: Popup And Dashboard

The popup and dashboard are Arabic RTL extension pages.

## Popup

Source files:

- `entrypoints/popup/index.html`
- `entrypoints/popup/main.ts`
- `src/app/popup/index.ts`
- `src/app/popup/popup.css`

The popup displays:

- today's project count
- total seen jobs
- last check time
- dashboard open button
- manual check button
- notification toggle
- source diagnostics button
- unread admin-message banner with optional link and dismiss action
- platform footer links for Mostaql, Khamsat, and Nafezly

Popup actions call background messages for manual polling and diagnostics. Admin broadcasts are read from `adminMessages`; dismissing the banner marks stored messages read.

## Dashboard

Source files:

- `entrypoints/dashboard/index.html`
- `entrypoints/dashboard/main.ts`
- `src/app/dashboard/*.ts`
- `src/app/dashboard/*.css`

Dashboard sections:

- overview
- Mostaql bid tracker
- filters
- AI prompts
- proposal template
- advanced settings

The dashboard bootstraps:

- tab controller
- settings form
- prompt manager
- tracked projects panel
- bid tracker
- connection status panel

## Accessibility And RTL Behavior

Current UI behavior includes:

- `lang="ar"` and `dir="rtl"` roots
- tablist/tab/tabpanel relationships for dashboard sections
- live status regions for async actions
- labeled dashboard settings controls
- accessible prompt dialog semantics
- reduced-motion CSS blocks for injected content styles
- LTR handling for URL/API/model-like input fields where present in HTML

## Settings Validation

Dashboard save validates:

- polling interval and numeric bounds
- ChatGPT URL host
- direct mode model/API-key requirements only when unsafe direct controls are present
- native input constraints for URLs and numbers

Storage normalization repeats critical validation defensively.

Direct AI controls are rendered only when the build has `WXT_ENABLE_UNSAFE_DIRECT_AI=true`. Normal builds show bridge settings and force direct-mode state back to bridge.

## Backup UI

Dashboard backup export/import:

- exports a JSON payload from `BackupRepository`
- rejects unsupported or unrecognized import payloads
- previews counts and sensitive-field handling
- asks for confirmation before applying import

## Failure Behavior

| UI area        | Failure behavior                                                            |
| -------------- | --------------------------------------------------------------------------- |
| Popup action   | Shows visible/live status text and re-enables controls after pending state. |
| Dashboard save | Shows validation or save status and does not persist invalid data.          |
| Prompt editor  | Validates required fields inline.                                           |
| Backup import  | Rejects invalid files before repository import.                             |
| Bid tracker    | Renders loading, empty, error, and data states.                             |

Related docs:

- [`reference/source/app-dashboard.md`](reference/source/app-dashboard.md)
- [`reference/source/app-popup.md`](reference/source/app-popup.md)
