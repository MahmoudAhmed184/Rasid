# Contributing to Rasid

Rasid is a cross-browser Manifest V3 extension built with WXT and TypeScript. Contributions should keep the shipped extension coherent across source, generated manifests, privacy text, documentation, and store-review expectations.

## Before You Start

- Search existing issues and pull requests before opening a duplicate.
- Open an issue before large feature work, platform additions, permission changes, storage migrations, or architectural refactors.
- Read [`README.md`](../README.md), [`docs/README.md`](../docs/README.md), and the relevant maintainer docs before changing runtime behavior.
- Do not commit secrets, AI API keys, personal marketplace data, browser profiles, generated packages, or private test credentials.

## Current Release Scope

| Area                | Current scope                                                              |
| ------------------- | -------------------------------------------------------------------------- |
| Browser targets     | Chrome/Chromium MV3 and Firefox MV3                                        |
| Supported platforms | Mostaql, Khamsat, Nafezly                                                  |
| AI modes            | Direct OpenAI/Gemini/Claude requests and user-mediated ChatGPT bridge mode |
| Realtime backend    | Default SignalR endpoint configured in source                              |
| Generated output    | `.wxt/` and `dist/` are generated and should not be hand-edited            |

Any change that expands platform support, host permissions, AI destinations, storage keys, or browser permissions must update source, generated-manifest validation notes, README, privacy text, store-review docs, and relevant source-reference docs together.

## Development Setup

Use Node.js `>=20.19.0`.

```bash
npm ci
npm run postinstall
```

Common development commands:

```bash
npm run dev:chrome
npm run dev:firefox
npm run build
```

## Branch Naming

Use short, descriptive branch names:

- `feature/<name>`
- `fix/<name>`
- `docs/<name>`
- `refactor/<name>`
- `chore/<name>`

Open pull requests against `main` unless maintainers request another target.

## Source Boundaries

| Path             | Ownership                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `entrypoints/`   | WXT entrypoints for background, popup, dashboard, content scripts, offscreen, and bridge behavior  |
| `src/app/`       | Runtime composition, background handlers, content bootstraps, popup/dashboard controllers          |
| `src/entities/`  | Domain models, settings/runtime defaults, provider contracts, platform identity helpers            |
| `src/features/`  | Monitoring, realtime, notifications, downloads, proposals, backup, storage-facing feature behavior |
| `src/platforms/` | Platform adapters, selectors, parser logic, content panels, autofill, export helpers               |
| `src/shared/`    | Browser, storage, DOM, network, parser, and cross-feature utilities                                |
| `public/`        | Static assets copied into extension output                                                         |
| `docs/`          | Public, maintainer, reviewer, folder, file, and function documentation                             |
| `.github/`       | Community health files, issue forms, PR template, and security policy                              |

Keep entrypoints thin. Put reusable behavior in the current source owner rather than duplicating it across entrypoints or UI controllers.

## Engineering Standards

- Preserve Manifest V3 constraints. Do not add remote scripts, dynamic code execution, or browser-incompatible background patterns.
- Keep browser-specific behavior explicit. Chrome-only offscreen behavior and Firefox local fallbacks must remain documented.
- Use least-privilege permissions and narrow host permissions.
- Validate messages and data crossing content-script, background, offscreen, storage, and network boundaries.
- Treat scraped page content, AI output, imported backups, SignalR payloads, and direct provider responses as untrusted until normalized.
- Keep proposal generation and autofill user-controlled. The extension should not submit marketplace proposals or ChatGPT prompts on the user's behalf.
- Avoid incidental refactors in behavior PRs. Split broad cleanup from user-visible changes.
- Do not add dependencies or package upgrades unless the PR explains why the existing stack is insufficient.

## Documentation Requirements

Update documentation in the same PR when changing:

- supported platform scope
- browser permissions or host permissions
- content scripts or generated manifest behavior
- storage keys, backup/import/export behavior, or secret handling
- AI provider behavior, prompt variables, or ChatGPT bridge behavior
- SignalR, polling, notifications, downloads, or offscreen/local task behavior
- popup, dashboard, or content-script UI behavior
- build, test, packaging, or release workflow

Start with [`docs/README.md`](../docs/README.md) to find the affected docs.

## Verification

Run the full validation set before opening a release-facing pull request:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run lint:firefox
```

Run tests when behavior or storage contracts change:

```bash
npm test
```

For browser-facing changes, also do manual smoke testing on the affected browser and feature area:

- popup actions and status
- dashboard settings, prompts, backup, diagnostics, tracked projects, and bid tracker
- content panels and autofill on affected platforms
- notifications, realtime, and polling fallback
- direct AI provider mode and ChatGPT bridge mode
- Chrome package load from `dist/chrome-mv3`
- Firefox temporary load or `web-ext lint` from `dist/firefox-mv3`

## Pull Request Expectations

- Keep the PR focused on one logical change.
- Describe user-visible impact and reviewer risk.
- Link the issue when one exists.
- Call out permissions, host permissions, storage, privacy, AI, or generated-manifest changes explicitly.
- Include exact commands run and meaningful manual test notes.
- Add screenshots or short recordings for visible UI changes when useful.
- Explain any skipped validation and whether the skip is related to the PR.

## Security Reports

Do not report vulnerabilities through public issues. Follow [`.github/SECURITY.md`](SECURITY.md).
