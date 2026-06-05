# Adding A Platform

Adding a platform is a release-surface change, not only a parser change.

## Required Extension Surfaces

1. Add or confirm the platform ID in `src/entities/platform/model.ts`.
2. Add display name and host mapping.
3. Add monitoring defaults only when the platform is intended to ship.
4. Add platform folder under `src/platforms/<platform>/`.
5. Add adapter, selectors, content extraction, feeds, monitoring adapter, and HTML parser.
6. Register the platform in `src/platforms/registry.ts`.
7. Add a WXT content entrypoint if content UI ships.
8. Add required or optional host permission in `wxt.config.ts` only when the new behavior needs it.
9. Add popup/dashboard UI where relevant.
10. Update `PRIVACY.md`, README, and docs.
11. Build and inspect generated manifests.
12. Add tests or fixtures where possible.

## Platform Module Minimum

Recommended files:

- `adapter.ts`
- `selectors.ts`
- `feeds.ts`
- `monitoring.ts`
- `html-parser.ts`
- `index.ts`
- `content/data.ts`
- `content/project-panel.ts` or equivalent
- optional `content/autofill.ts`

## Parser Rules

- Resolve URLs through `resolvePlatformUrl()` or an equivalent allowlisted helper.
- Deduplicate parsed jobs by stable ID.
- Return partial detail data from project parsers and `null` when no useful fields are found.
- Treat anti-bot/challenge pages as fetch failures before parsing where possible.

## Content Script Rules

- Match only required host patterns.
- Use adapter `matchPage()` to scope UI contributions.
- Use safe DOM creation and `textContent` for user/platform data.
- Do not submit forms automatically.
- Queue autofill drafts through the proposal repository and clear them after use or expiry.

## Release Rules

Do not claim a platform is supported until all of these are true:

- source module exists
- registry includes it
- manifest host permission exists
- required vs optional host permission category is justified
- content script exists if content features are claimed
- settings/UI expose it if monitoring is claimed
- privacy docs disclose it
- generated manifests match the claim
- validation commands pass

Related docs:

- [`09-content-scripts-and-platforms.md`](09-content-scripts-and-platforms.md)
- [`05-module-boundaries.md`](05-module-boundaries.md)
