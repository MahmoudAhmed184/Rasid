# Privacy And Security Model

This document complements [`../PRIVACY.md`](../PRIVACY.md) with architecture-focused privacy and security notes.

## Data Minimization

Rasid stores only operational extension state needed for monitoring, notification, proposal drafting, tracking, UI settings, and exports.

Direct-mode API keys are session-scoped and omitted from persistent settings and backups.

## Local Storage

Persistent local state can include:

- settings and filters
- prompt templates and proposal template
- recent and seen job records
- tracked projects
- runtime SignalR and monitoring state
- notification click payloads
- queued autofill drafts
- backup-exported state

Sensitive transient state:

- `pendingChatGptPrompt` is short-lived and cleared after use/failure/expiry.
- `aiApiKeySecret` is session-scoped and cleared on backup import.

## Network Destinations

| Destination             | Data                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Mostaql/Khamsat/Nafezly | HTML `GET` requests, content-script DOM reads, and explicit Mostaql export attachment requests.                     |
| SignalR backend         | Connection receives job payloads; current extension code does not send prompts or proposals as custom hub payloads. |
| OpenAI/Gemini/Claude    | Direct-mode prompt text and generation parameters.                                                                  |
| ChatGPT websites        | Bridge prompt inserted into page DOM for user review.                                                               |

## Security Controls

- host permissions are explicit in `wxt.config.ts`
- runtime message payloads and senders are validated
- offscreen RPC payloads/results are validated
- AI context URLs are host-allowlisted
- notification click URLs are normalized and host-allowlisted
- ZIP remote URLs are HTTPS and platform-host allowlisted
- ZIP generation has count and byte caps
- prompt variables are wrapped as untrusted fields
- provider errors avoid exposing raw prompts or keys

## Residual Risks

- Browser storage is not encrypted by this repository.
- Direct AI mode exposes the user-owned provider key to the selected provider request.
- Content scripts necessarily read supported platform page DOM.
- Marketplace selectors can drift and require maintenance.
- The optional backend tree is not reviewed as part of the WebExtension release docs.

Related docs:

- [`12-browser-permissions-and-privacy.md`](12-browser-permissions-and-privacy.md)
- [`10-ai-proposals-and-chatgpt-bridge.md`](10-ai-proposals-and-chatgpt-bridge.md)
