# Contributing to Frelancia

Thanks for contributing to Frelancia. This project is a cross-browser Manifest V3 extension built with WXT and TypeScript. Keep changes small, explicit, and easy to review.

## Before You Start

- Search existing [issues](https://github.com/Elaraby218/Frelancia/issues) before opening a new one.
- Open or comment on an issue before starting large changes, architectural refactors, or behavior changes.
- Align new work with the current WXT-based structure. Do not reintroduce the legacy pre-refactor layout.

## Development Setup

1. Fork the repository and clone your fork.
2. Install dependencies:

```bash
npm install
```

3. If generated WXT files are missing, run:

```bash
npm run postinstall
```

## Branch Naming

Use short, descriptive branch names:

- `feature/<name>`
- `fix/<name>`
- `refactor/<name>`
- `docs/<name>`
- `chore/<name>`

Open pull requests against `main` unless maintainers ask for a different target branch.

## Project Structure

| Path | Purpose |
| --- | --- |
| `entrypoints/` | WXT entrypoints for the background worker, popup, dashboard, content scripts, and offscreen document |
| `src/application/` | Core background services, workflow orchestration, scheduling, and runtime messaging |
| `src/infrastructure/` | Browser and external integrations (AI, storage, notifications, offscreen, realtime SignalR) |
| `src/models/` | Shared domain types, defaults, and runtime configuration |
| `src/platforms/` | Platform-specific adapters, DOM parsing, and content script integrations |
| `src/shared/` | Common utilities and helpers |
| `src/ui/` | UI modules for popup, dashboard, Mostaql integrations, chat bridge, offscreen helpers, and shared assets |
| `public/` | Static assets copied into the final extension build |
| `docs/` | Project architecture, data flow, setup, and release review notes |

## Engineering Standards

- Prefer TypeScript for new shared logic and entrypoints.
- Keep code modular. Put reusable logic in `src/application/`, `src/infrastructure/` or `src/models/` instead of duplicating behavior across entrypoints.
- Preserve Manifest V3 safety. Do not add remote scripts, `eval`, or browser-incompatible background patterns.
- Keep browser behavior explicit. Chrome-only and Firefox-specific behavior should be intentional and documented in code when needed.
- Do not commit secrets, API keys, personal data, or test credentials.
- Avoid incidental refactors in feature PRs. If a refactor is necessary, separate it clearly from behavior changes.
- Update documentation when behavior, build steps, permissions, or supported workflows change.

## Coding Conventions

- Follow the repository formatter and linter output.
- Prefer clear names and straightforward control flow over clever abstractions.
- Keep comments sparse and useful. Explain non-obvious behavior, not basic syntax.
- Reuse existing patterns for storage access, runtime messaging, and UI bootstrapping before introducing new ones.
- Keep entrypoints thin. Business logic should live in shared modules where possible.

## Verification

Run the relevant checks before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run build
```

If your change affects Firefox packaging or release behavior, also run:

```bash
npm run lint:firefox
```

If your change affects browser behavior, test the relevant flow manually:

- Popup actions
- Dashboard settings and diagnostics
- Mostaql content-script behavior
- Notification and polling behavior
- Firefox temporary loading when applicable

## Pull Request Guidelines

- Keep PRs focused on one logical change.
- Use a clear title and describe user-visible impact.
- Call out any permissions, manifest, storage, or build-pipeline changes explicitly.
- Include verification steps in the PR description.
- Add screenshots or short recordings for dashboard, popup, or content-script UI changes when helpful.

## Documentation to Keep in Sync

When relevant, update:

- `README.md`
- `PRIVACY.md`
- `docs/01-setup-and-workflow.md`
- `docs/02-architecture-and-data-flow.md`
- `docs/03-cross-browser-quirks.md`
- `docs/04-ai-content-bridge.md`
- `docs/05-adding-a-platform.md`
- `docs/firefox-testing.md`
- `docs/amo-review.md`

## PR Checklist

- [ ] The change is scoped and reviewable
- [ ] Lint, typecheck, and build pass locally
- [ ] No secrets or user-specific data were added
- [ ] Documentation was updated where needed
- [ ] Browser-specific behavior was verified when applicable
