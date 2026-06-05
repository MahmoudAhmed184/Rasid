# Store Review Notes

This document summarizes review-facing behavior for Chrome Web Store and AMO preparation. The current `v1.0.0` release flow creates GitHub draft releases only; Chrome Web Store submission, Firefox AMO signing, and automated browser-store submission are intentionally out of scope.

## Generated Manifest Claims

Current WXT config generates:

- MV3 manifest
- extension name `Frelancia | فريلانسيا`
- short name `Frelancia`
- version `1.0.0`
- Chrome minimum version `120`
- Firefox strict minimum version `140.0`
- Firefox Android strict minimum version `142.0`
- Gecko ID `frelancia@mostaql-notifier`
- action popup
- dashboard/options page
- background entrypoint
- three static content-script surfaces: Khamsat, Mostaql, Nafezly
- unlisted ChatGPT bridge script injected on demand after optional host permission approval

## Permission Justification

| Permission      | Review justification                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `alarms`        | Required for polling and SignalR lifecycle in MV3.                                               |
| `downloads`     | Required for generated ZIP exports.                                                              |
| `notifications` | Core job notification feature.                                                                   |
| `scripting`     | Required for on-demand ChatGPT bridge injection.                                                 |
| `storage`       | Required for settings, jobs, prompts, runtime state, bridge/autofill state, and cleanup records. |
| `offscreen`     | Chrome-only audio, DOM parsing, and Blob URL generation.                                         |

## Host Permission Justification

Marketplace hosts are required and tied to shipped monitoring/content features. The default backend host is required for SignalR realtime mode and admin broadcasts. `http://localhost/*` is required for local extension/backend development.

ChatGPT hosts are optional and requested when a user opens bridge mode. AI provider hosts are optional only in unsafe side builds where `WXT_ENABLE_UNSAFE_DIRECT_AI=true`.

## Remote Code And Generated Code

The extension source does not load remote scripts. WXT/Vite bundle dependencies into generated output. Network requests are data/API requests initiated by bundled code.

## Privacy Disclosure Synchronization

Keep these files synchronized:

- [`../README.md`](../README.md)
- [`../PRIVACY.md`](../PRIVACY.md)
- [`12-browser-permissions-and-privacy.md`](12-browser-permissions-and-privacy.md)
- [`17-privacy-and-security-model.md`](17-privacy-and-security-model.md)
- generated manifest files after build

## Firefox Review Notes

- Run `npm run build:firefox`.
- Run `npm run lint:firefox`.
- Confirm Firefox output omits `offscreen`.
- Confirm `browser_specific_settings.gecko.data_collection_permissions.required` contains `websiteContent`.

## Chrome Review Notes

- Run `npm run build:chrome`.
- Confirm Chrome output includes `minimum_chrome_version: "120"`.
- Confirm Chrome output includes `offscreen`.
- Confirm offscreen document is bundled and only used for audio, DOMParser, and Blob URL tasks.

Related docs:

- [`13-build-test-release.md`](13-build-test-release.md)
- [`17-privacy-and-security-model.md`](17-privacy-and-security-model.md)
