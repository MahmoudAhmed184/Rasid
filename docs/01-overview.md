# Overview

Frelancia is a cross-browser Manifest V3 WebExtension for monitoring Arabic freelancing opportunities and preparing user-reviewed proposals.

## Product Purpose

Frelancia helps users:

- monitor supported marketplace feeds
- receive browser notifications for new filtered opportunities
- track projects from supported platform pages
- draft proposals using reusable prompts
- use a ChatGPT bridge workflow in normal builds, with direct AI-provider calls only in unsafe side builds
- export selected Mostaql project/message data into bounded ZIP downloads

The extension does not submit marketplace proposals automatically.

## Current Release Status

| Area                          | Current state                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Version                       | `1.0.0`                                                                                    |
| Package name                  | `frelancia`                                                                                |
| Manifest name                 | `Frelancia \| فريلانسيا`                                                                   |
| Build system                  | WXT MV3                                                                                    |
| Browser targets               | Chrome MV3 and Firefox MV3                                                                 |
| Supported extension platforms | Mostaql, Khamsat, Nafezly                                                                  |
| Bridge hosts                  | `chatgpt.com`, `chat.openai.com`                                                           |
| Direct AI providers           | OpenAI, Gemini, Claude only when `WXT_ENABLE_UNSAFE_DIRECT_AI=true`                        |
| Default realtime backend      | `https://rasid.runasp.net/jobNotificationHub`                                              |
| Optional backend tree         | `server/`, out of the WebExtension release scope unless explicitly included by maintainers |

## Supported Platforms

| Platform | Monitoring                                               | Content UI                                   | Proposal source | Autofill | Export |
| -------- | -------------------------------------------------------- | -------------------------------------------- | --------------- | -------- | ------ |
| Mostaql  | Feed and detail parsing                                  | Project, message, home, profile integrations | Yes             | Yes      | Yes    |
| Khamsat  | Community request listing and best-effort detail parsing | Project/request panel                        | Yes             | Yes      | No     |
| Nafezly  | Project listing and detail parsing                       | Project panel                                | Yes             | Yes      | No     |

## Browser Targets

| Browser             | Output             | Current generated behavior                                                                                              |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Chrome / Chromium   | `dist/chrome-mv3`  | Service worker background, `offscreen` permission, offscreen HTML page included.                                        |
| Firefox             | `dist/firefox-mv3` | WXT Firefox MV3 output, no offscreen permission, Gecko ID `frelancia@mostaql-notifier`, strict minimum version `140.0`. |
| Firefox for Android | `dist/firefox-mv3` | Gecko Android strict minimum version `142.0`.                                                                           |

## Repository Scope

Extension source:

- `entrypoints/`
- `src/`
- `public/`
- root config files
- `tests/`
- `docs/`

Generated or local-only output:

- `.wxt/`
- `dist/`
- `.test-dist/`
- `node_modules/`

The `server/` tree is optional backend source and is not part of the documented WebExtension package by default.

Related docs:

- [`02-high-level-architecture.md`](02-high-level-architecture.md)
- [`12-browser-permissions-and-privacy.md`](12-browser-permissions-and-privacy.md)
- [`13-build-test-release.md`](13-build-test-release.md)
