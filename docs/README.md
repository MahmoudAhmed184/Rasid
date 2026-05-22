# Rasid Documentation

This directory documents the current Rasid WebExtension source tree. The source of truth is the current code, config, generated manifest behavior, README, and privacy policy.

## Recommended Reading Paths

| Reader                 | Start here                                                                       | Then read                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New developer          | [`../README.md`](../README.md)                                                   | [`01-overview.md`](01-overview.md), [`13-build-test-release.md`](13-build-test-release.md), [`reference/folder-structure.md`](reference/folder-structure.md)     |
| Maintainer             | [`15-maintainer-guide.md`](15-maintainer-guide.md)                               | [`05-module-boundaries.md`](05-module-boundaries.md), [`06-storage-and-state.md`](06-storage-and-state.md), [`20-testing-strategy.md`](20-testing-strategy.md)   |
| Store reviewer         | [`12-browser-permissions-and-privacy.md`](12-browser-permissions-and-privacy.md) | [`16-store-review-notes.md`](16-store-review-notes.md), [`17-privacy-and-security-model.md`](17-privacy-and-security-model.md), [`../PRIVACY.md`](../PRIVACY.md) |
| Platform contributor   | [`09-content-scripts-and-platforms.md`](09-content-scripts-and-platforms.md)     | [`18-adding-a-platform.md`](18-adding-a-platform.md), relevant files under [`reference/source/`](reference/source/)                                              |
| AI provider maintainer | [`10-ai-proposals-and-chatgpt-bridge.md`](10-ai-proposals-and-chatgpt-bridge.md) | [`19-ai-provider-maintenance.md`](19-ai-provider-maintenance.md), [`reference/source/entities.md`](reference/source/entities.md)                                 |

## Main Docs

| Doc                                                                              | Description                                                                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`01-overview.md`](01-overview.md)                                               | Product purpose, current release status, supported platforms, browser targets, and repository scope.                   |
| [`02-high-level-architecture.md`](02-high-level-architecture.md)                 | Runtime components and how entrypoints, app modules, features, entities, platforms, and shared utilities fit together. |
| [`03-runtime-data-flow.md`](03-runtime-data-flow.md)                             | Monitoring, realtime, polling, notifications, proposal generation, bridge, export, and backup flows.                   |
| [`04-low-level-design.md`](04-low-level-design.md)                               | Lower-level responsibilities, contracts, browser APIs, failure behavior, and validation touchpoints.                   |
| [`05-module-boundaries.md`](05-module-boundaries.md)                             | Ownership and import-boundary rules for the feature-first source layout.                                               |
| [`06-storage-and-state.md`](06-storage-and-state.md)                             | Storage keys, schemas, normalizers, persistence boundaries, backup/import/export, and secret handling.                 |
| [`07-runtime-messaging.md`](07-runtime-messaging.md)                             | Background and offscreen message contracts, validators, sender checks, and error behavior.                             |
| [`08-background-runtime.md`](08-background-runtime.md)                           | Background service worker bootstrap, alarms, SignalR, polling, notifications, downloads, and offscreen/local tasks.    |
| [`09-content-scripts-and-platforms.md`](09-content-scripts-and-platforms.md)     | Platform adapters, content scripts, page routing, proposal sources, autofill, selectors, and monitoring parsers.       |
| [`10-ai-proposals-and-chatgpt-bridge.md`](10-ai-proposals-and-chatgpt-bridge.md) | Prompt rendering, direct provider mode, ChatGPT bridge mode, API key storage, provider errors, and privacy notes.      |
| [`11-ui-popup-dashboard.md`](11-ui-popup-dashboard.md)                           | Popup and dashboard behavior, Arabic/RTL UI, accessibility, settings validation, and backup workflows.                 |
| [`12-browser-permissions-and-privacy.md`](12-browser-permissions-and-privacy.md) | Manifest permissions, host permissions, browser differences, privacy boundaries, and review constraints.               |
| [`13-build-test-release.md`](13-build-test-release.md)                           | Setup, build, test, format, Firefox lint, package, generated manifest, and release checklist.                          |
| [`14-troubleshooting.md`](14-troubleshooting.md)                                 | Build, runtime, notification, SignalR, polling, AI, bridge, autofill, and export troubleshooting.                      |
| [`15-maintainer-guide.md`](15-maintainer-guide.md)                               | Maintenance workflow, source-of-truth rules, change review, platform/AI/storage/release guardrails.                    |
| [`16-store-review-notes.md`](16-store-review-notes.md)                           | Chrome Web Store and AMO review notes grounded in current manifest and code behavior.                                  |
| [`17-privacy-and-security-model.md`](17-privacy-and-security-model.md)           | Data minimization, network destinations, storage boundaries, security controls, and residual risks.                    |
| [`18-adding-a-platform.md`](18-adding-a-platform.md)                             | Steps and review gates for adding a new platform safely.                                                               |
| [`19-ai-provider-maintenance.md`](19-ai-provider-maintenance.md)                 | Maintaining direct AI providers, prompts, bridge behavior, and provider error handling.                                |
| [`20-testing-strategy.md`](20-testing-strategy.md)                               | Current automated tests, validation commands, manual smoke tests, and remaining coverage gaps.                         |

## Reference Docs

| Doc                                                                                                                              | Description                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`reference/folder-structure.md`](reference/folder-structure.md)                                                                 | Folder-level ownership, runtime role, imports/exports relationship, and release relevance.          |
| [`reference/source/entrypoints.md`](reference/source/entrypoints.md)                                                             | WXT entrypoints, HTML/CSS assets, runtime contexts, and entrypoint functions.                       |
| [`reference/source/app-background.md`](reference/source/app-background.md)                                                       | Background app composition, message bus, message validators, and runtime handlers.                  |
| [`reference/source/app-content.md`](reference/source/app-content.md)                                                             | ChatGPT bridge and platform content bootstrap/service modules.                                      |
| [`reference/source/app-dashboard.md`](reference/source/app-dashboard.md)                                                         | Dashboard controllers and related UI files.                                                         |
| [`reference/source/app-popup.md`](reference/source/app-popup.md)                                                                 | Popup controller and popup styling.                                                                 |
| [`reference/source/entities.md`](reference/source/entities.md)                                                                   | Domain models, AI providers, runtime/settings/platform helpers.                                     |
| [`reference/source/features-monitoring.md`](reference/source/features-monitoring.md)                                             | Monitoring, filters, polling, realtime batch processing, and tracking repositories.                 |
| [`reference/source/features-proposals.md`](reference/source/features-proposals.md)                                               | Prompt repositories, proposal generation, prompt rendering, and backup/settings repositories.       |
| [`reference/source/features-realtime-notifications-downloads.md`](reference/source/features-realtime-notifications-downloads.md) | SignalR, notifications, audio, downloads, offscreen tasks, and ZIP generation.                      |
| [`reference/source/platforms-mostaql.md`](reference/source/platforms-mostaql.md)                                                 | Mostaql adapter, monitoring, parser, content UI, export, bid tracker, and selectors.                |
| [`reference/source/platforms-khamsat.md`](reference/source/platforms-khamsat.md)                                                 | Khamsat adapter, monitoring, parser, content panel, data extraction, and selectors.                 |
| [`reference/source/platforms-nafezly.md`](reference/source/platforms-nafezly.md)                                                 | Nafezly adapter, monitoring, parser, content panel, autofill, data extraction, and selectors.       |
| [`reference/source/shared-browser-storage.md`](reference/source/shared-browser-storage.md)                                       | Browser storage clients, storage facade, storage modules, schema, keys, and snapshot normalization. |
| [`reference/source/shared-dom-network-utils.md`](reference/source/shared-dom-network-utils.md)                                   | DOM helpers, parsing helpers, challenge-page detection, icon shim, config files.                    |

## Maintenance Notes

- Trust current source and generated manifest output over older docs.
- Keep [`../README.md`](../README.md), [`../PRIVACY.md`](../PRIVACY.md), and this index synchronized when platform support, permissions, storage, AI behavior, or release workflow changes.
- Deleted legacy docs are intentionally not linked. Current docs use the numbered documentation set and reference docs.
