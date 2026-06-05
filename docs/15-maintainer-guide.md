# Maintainer Guide

## Source-Of-Truth Order

1. Current code and config.
2. Generated manifest output after `npm run build`.
3. `PRIVACY.md`.
4. Current docs under `docs/`.
5. Generated manifests as validation evidence after build.

If older docs disagree with current code, update the docs.

## Change Review Checklist

For every meaningful change, ask whether it affects:

- platform support
- permissions or host permissions
- storage keys or backup/import behavior
- AI prompt/provider behavior
- SignalR, admin broadcast, or polling behavior
- notification/download behavior
- popup/dashboard/content UI
- generated manifests
- privacy disclosures
- tests or validation commands

## Platform Maintenance

Selectors and parsers drift with marketplace HTML. Keep platform-specific behavior in:

- `src/platforms/<platform>/selectors.ts`
- `src/platforms/<platform>/html-parser.ts`
- `src/platforms/<platform>/content/*.ts`
- `src/platforms/<platform>/adapter.ts`
- `src/platforms/<platform>/monitoring.ts`

Do not add platform-specific selectors to shared modules.

## AI Maintenance

Provider endpoints and response shapes are owned by:

- `src/entities/ai/providers/openai.ts`
- `src/entities/ai/providers/gemini.ts`
- `src/entities/ai/providers/claude.ts`
- `src/entities/ai/providers/shared.ts`

Keep provider errors redacted and categorized. Do not log prompts or API keys.

Normal builds must remain bridge-first. Direct provider behavior, provider host permissions, and dashboard direct controls must stay gated behind `WXT_ENABLE_UNSAFE_DIRECT_AI=true`.

ChatGPT bridge maintenance must cover both the background `openChatBridgePrompt` handler and the unlisted `entrypoints/chatgpt-bridge.ts` script.

## Storage Maintenance

When adding state:

- define the type in `schema.ts` or a focused module
- add a normalizer
- update `SNAPSHOT_KEYS` only if it belongs in the persistent snapshot
- update backup export/import intentionally
- update `PRIVACY.md` and `docs/06-storage-and-state.md`
- add or update tests when possible

## Release Maintenance

Before release:

- update `package.json` version in a normal PR; generated manifests read from that version
- run `npm run release:check`
- run `npm run release:zip`
- run `npm run release:evidence`
- run `npm run release:notes -- 1.0.0 .output/release-notes.md`
- inspect `.output/` release assets and generated manifests
- run `dotnet restore server/src/Rasid.Server.sln --locked-mode`, `dotnet build server/src/Rasid.Server.sln -c Release --no-restore`, and `dotnet test server/src/Rasid.Server.sln -c Release --no-build` when backend/admin-broadcast/freshness contracts changed
- run `dotnet publish server/src/Rasid.Server.csproj -c Release --no-restore -o /tmp/rasid-server-publish` when backend release behavior changed
- verify only the intended supported platforms appear in source, UI, permissions, and generated manifests
- keep README, privacy text, store-review notes, and generated manifest claims aligned
- dispatch `Extension Release` once with `create_release=false`, then with `create_release=true` for the draft GitHub Release

Chrome Web Store submission, Firefox AMO signing, automated browser-store submission, and backend release artifacts are outside the documented extension release flow.

Related docs:

- [`18-adding-a-platform.md`](18-adding-a-platform.md)
- [`19-ai-provider-maintenance.md`](19-ai-provider-maintenance.md)
- [`20-testing-strategy.md`](20-testing-strategy.md)
