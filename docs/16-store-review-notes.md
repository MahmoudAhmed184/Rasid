# Store Review Notes

This document summarizes review-facing behavior for Chrome Web Store and AMO preparation.

## Generated Manifest Claims

Current WXT config generates:

- MV3 manifest
- extension name `Rasid | راصد`
- version `1.0.0`
- Chrome minimum version `120`
- Firefox strict minimum version `140.0`
- Firefox Android strict minimum version `142.0`
- action popup
- dashboard/options page
- background entrypoint
- four content-script surfaces: ChatGPT bridge, Khamsat, Mostaql, Nafezly

## Permission Justification

| Permission      | Review justification                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `alarms`        | Required for polling and SignalR lifecycle in MV3.                                               |
| `downloads`     | Required for generated ZIP exports.                                                              |
| `notifications` | Core job notification feature.                                                                   |
| `storage`       | Required for settings, jobs, prompts, runtime state, bridge/autofill state, and cleanup records. |
| `offscreen`     | Chrome-only audio, DOM parsing, and Blob URL generation.                                         |

## Host Permission Justification

Marketplace hosts are tied to shipped monitoring/content features. ChatGPT hosts are tied to the bridge content script. AI provider hosts are tied to direct mode. The default backend host is tied to SignalR realtime mode.

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
