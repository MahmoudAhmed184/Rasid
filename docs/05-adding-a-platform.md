# Adding A Platform

This file is the implementation plan for adding a new freelancing platform to Rasid after the current refactor. It is written against the current manifest-based platform architecture, not the older multi-registry layout.

## Goal

Add one new platform with:

- host permission and content entrypoint
- monitoring feed support
- HTML parsing for listing and detail pages
- optional page UI contributions
- optional proposal autofill and AI workflow
- current docs and review notes

## Decide The Scope First

Before writing code, choose which level of support the platform needs.

### Monitoring-only

Use this scope when the extension should:

- poll the platform for new opportunities
- parse listing pages
- optionally hydrate project detail pages
- send notifications

You do not need page-side controls, autofill, export, or AI proposal generation for this scope.

### Full content support

Use this scope when the extension should also:

- inject buttons or sidebars on project pages
- track projects from the page itself
- generate AI proposals from page data
- queue proposal autofill
- export project or conversation data

## Required Files And Touchpoints

These are the main places you will touch for a brand-new platform ID.

### IDs, settings, and storage

- `src/platforms/platform-ids.ts`
- `src/entities/settings/model.ts`
- `src/shared/storage/modules/proposal-state-storage.ts`
- `wxt.config.ts`

### Platform implementation

- `src/platforms/<platform>/adapter.ts`
- `src/platforms/<platform>/monitoring.ts`
- `src/platforms/<platform>/html-parser.ts`
- `src/platforms/<platform>/feeds.ts`

Optional but common:

- `src/platforms/<platform>/selectors.ts`
- `src/platforms/<platform>/content/data.ts`
- `src/platforms/<platform>/content/*.ts`

### Registration and entrypoints

- `src/platforms/registry.ts`
- `entrypoints/<platform>.content/index.ts`
- `entrypoints/<platform>.content/style.css`

### Documentation and review metadata

- `README.md`
- `PRIVACY.md`
- `docs/02-architecture-and-data-flow.md`
- `docs/amo-review.md`

## Step 1. Add Or Enable The Platform ID

If the platform is completely new, extend:

- `PLATFORM_IDS`
- `PlatformId`
- `PLATFORM_DISPLAY_NAMES`

in `src/platforms/platform-ids.ts`.

Then update:

- `DEFAULT_MONITORED_PLATFORMS` in `src/entities/settings/model.ts`
- `PLATFORM_AUTOFILL_KEYS` in `src/shared/storage/modules/proposal-state-storage.ts`

If you are activating one of the predeclared IDs already present in `PlatformId`, you can skip the type addition and only implement the concrete platform files.

## Step 2. Add Host Permissions

Add the platform host pattern to `hostPermissions` in `wxt.config.ts`.

Example shape:

```ts
const hostPermissions = [
    'https://mostaql.com/*',
    'https://khamsat.com/*',
    'https://example.com/*',
] as const;
```

Without this, the content script and monitoring fetches will not have the expected access.

## Step 3. Create The Monitoring Layer

Create `src/platforms/<platform>/feeds.ts`.

This file should expose the URLs that polling can fetch. Keep it dumb: just constants and simple feed resolution helpers.

Create `src/platforms/<platform>/html-parser.ts`.

This file should:

- parse listing HTML into shallow `JobRecord[]`
- parse project/detail HTML into `Partial<JobRecord> | null`
- use `DOMParser` rather than ad hoc HTML string injection
- keep selectors and text normalization local to the platform

Create `src/platforms/<platform>/monitoring.ts`.

This file should expose `create<Platform>MonitoringAdapter(...)` and implement:

- `id`
- `displayName`
- `debugProbeUrl`
- `resolveFeeds(settings)`
- `parseListingHtml(html)`
- `parseProjectHtml(html)`

The adapter should delegate parsing to the shared `PlatformMonitoringHtmlParser`, not parse remote HTML inline in background orchestration code.

## Step 4. Create The Content Adapter

Create `src/platforms/<platform>/adapter.ts`.

This file is the runtime seam for platform page behavior. It should implement `PlatformAdapter` from `src/platforms/contracts.ts`.

Minimum responsibilities:

- `id`
- `displayName`
- `matches`
- `isContextValid()`
- `matchPage(...)`
- `ui`
- `applyProposalAutofill(...)`

If the platform will not support proposal generation yet:

- return `null` from `extractProposalSource(...)`
- keep `ui` empty or minimal
- return `{ kind: 'not-available', reason: ... }` from autofill where appropriate

## Step 5. Add Content Modules

If the platform needs page-side UI, create files under `src/platforms/<platform>/content/`.

Typical split:

- `data.ts`
  Extract typed page data for AI, export, and tracking.
- `project-panel.ts` or `project-sidebar.ts`
  Inject DOM controls.
- `autofill.ts`
  Fill proposal forms from queued drafts.
- optional `home.ts`, `profile.ts`, `export.ts`, `prompts.ts`

Guidelines:

- use `PlatformContentServices` instead of importing storage singletons directly
- return `PlatformContributionMountResult` from UI contributions
- use DOM builders instead of `innerHTML` for dynamic UI
- keep selectors platform-local
- keep fetch, parsing, and DOM logic separate where possible

## Step 6. Add The Manifest-Facing Entrypoint

Create:

- `entrypoints/<platform>.content/index.ts`
- `entrypoints/<platform>.content/style.css`

The entrypoint should match the current content entrypoint pattern:

1. import the concrete adapter from `src/platforms/<platform>/index.ts`
2. create browser repositories with `createBrowserRepositories()` inside the WXT `main()` callback
3. create `PlatformContentServices`
4. call `bootstrapPlatformContent(...)`
5. call `bootstrapPlatformAutofill(...)`

This keeps composition at the entry surface instead of hiding it in platform modules.

## Step 7. Register The Platform In One Place

Add the module to `src/platforms/registry.ts`.

That manifest must contain:

- `id`
- `content`
- `realtime.supportsSignalR`
- `monitoringParser`
- `createMonitoringAdapter(...)`

Example shape:

```ts
example: {
    id: 'example',
    realtime: {
        supportsSignalR: false,
    },
    monitoringParser: {
        parseListingHtml: parseExampleListingHtml,
        parseProjectHtml: parseExampleProjectHtml,
    },
    createMonitoringAdapter: createExampleMonitoringAdapter,
},
```

If you miss this step, the platform will not be visible to background monitoring or offscreen HTML parsing.
Content entrypoints should still import their concrete platform adapter directly so each content script only bundles the platform it runs on.

## Step 8. Wire Settings And UX Defaults

Check these behaviors after the platform is registered:

- `DEFAULT_MONITORED_PLATFORMS` contains the new key
- dashboard settings preserve the new monitored-platform flag
- popup diagnostics work when only the new platform is enabled
- backup export/import preserves the new platform autofill key if autofill exists

If the platform supports SignalR, set:

- `realtime.supportsSignalR: true`

No hard-coded change should be needed in `signalr-manager.ts` beyond that capability metadata.

## Step 9. Update Privacy And Review Docs

At minimum, add the new platform to:

- `README.md`
- `PRIVACY.md`
- `docs/amo-review.md`

Document:

- host permission usage
- whether cookies are included on platform fetches
- whether content scripts run on that host
- whether exports or autofill are supported

## Step 10. Verification Checklist

Run:

```bash
npm run typecheck
npm run lint
npm run build:chrome
npm run build:firefox
npm run lint:firefox
```

Then manually verify:

1. The content script loads on the new host.
2. The platform page is classified correctly by `matchPage(...)`.
3. Monitoring fetches parse listing pages into stable `JobRecord` IDs.
4. Detail hydration adds richer fields without breaking filters.
5. Notifications open the correct project URL.
6. Dashboard and popup still work with only the new platform enabled.
7. If content UI exists:
    - buttons or panel mount once
    - tracking works
    - proposal generation works
    - autofill retries correctly until the form exists
8. Backup export/import still round-trips settings and proposal state.

## Suggested Delivery Order

Use this order to keep the work shippable:

1. Add ID, host permission, feeds, HTML parser, and monitoring adapter.
2. Register the platform in `registry.ts`.
3. Verify polling and notifications first.
4. Add the content entrypoint and a minimal adapter.
5. Add proposal extraction and autofill only after monitoring is stable.
6. Update docs and review metadata last.

## Definition Of Done

The platform addition is complete when:

- the platform is registered in `src/platforms/registry.ts`
- the host permission is present
- the content entrypoint exists if page UI is required
- monitoring works from real fetched HTML
- typed models compile without fallback `any`
- docs and review notes mention the new host and feature surface
- full verification passes
