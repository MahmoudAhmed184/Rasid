## Summary

<!-- What changed, why it changed, and the user/reviewer impact. -->

Fixes #

## Change Type

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Documentation
- [ ] Test or validation
- [ ] Build, packaging, or release
- [ ] Security or privacy

## Affected Area

- [ ] Background runtime, alarms, SignalR, polling, notifications, downloads, or offscreen/local tasks
- [ ] Popup or dashboard UI
- [ ] Content scripts or platform adapters
- [ ] Mostaql
- [ ] Khamsat
- [ ] Nafezly
- [ ] AI direct provider mode
- [ ] ChatGPT bridge mode
- [ ] Backend admin broadcast or popup admin-message behavior
- [ ] Storage, backup, import, export, or secret handling
- [ ] Manifest permissions, host permissions, or generated build output
- [ ] Documentation or GitHub metadata

## Release And Store-Review Impact

- [ ] No browser permission or host-permission changes
- [ ] No new network destination
- [ ] No new stored data, exported data, or backup schema change
- [ ] No change to supported platform scope
- [ ] No change to AI provider or ChatGPT bridge behavior
- [ ] Normal builds remain bridge-first; direct AI remains gated by `WXT_ENABLE_UNSAFE_DIRECT_AI=true`
- [ ] Store-review notes and privacy text are updated when needed

Explain any checked item that is not true:

```text

```

## Validation

Commands run:

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run lint:firefox`
- [ ] `dotnet test server/src/Rasid.Server.sln`

Manual testing:

- [ ] Chrome / Chromium MV3
- [ ] Firefox MV3
- [ ] Popup
- [ ] Dashboard
- [ ] Content script on affected platform
- [ ] Notifications, realtime, or polling
- [ ] ChatGPT bridge mode and optional host permission prompt
- [ ] Unsafe side-build direct provider mode
- [ ] Backup, import, export, or download flow

Environment:

- OS:
- Browser and version:
- Build output or dev command used:

## Documentation

- [ ] README updated when public behavior changed
- [ ] PRIVACY updated when data handling changed
- [ ] Relevant docs under `docs/` updated
- [ ] Source-reference docs updated when files, functions, storage keys, or contracts changed
- [ ] GitHub templates updated when contributor or release workflow changed
- [ ] Not applicable

## Reviewer Notes

<!-- Risks, tradeoffs, screenshots, logs, skipped checks, or follow-up work reviewers should know about. Do not include secrets or personal data. -->
