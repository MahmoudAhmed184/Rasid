# Privacy Disclosure

## What The Extension Stores

The extension stores the following data in browser local storage:

- notification and filtering settings
- tracked project state
- seen project IDs and recent project summaries
- prompt templates and proposal template text
- temporary autofill and ChatGPT handoff data
- connection status flags and lightweight usage counters

## What The Extension Connects To

The extension connects to these hosts:

- `https://mostaql.com/*` to read project and discussion pages requested by the user
- `https://chatgpt.com/*` and `https://chat.openai.com/*` to hand off prompt text when the user explicitly opens AI drafting
- `https://frelancia.runasp.net/*` for SignalR-based job notifications when enabled

## Firefox Consent Category

For the Firefox AMO package, the manifest declares `websiteContent` as required data collection because the extension reads Mostaql project content and can hand project details to AI chat pages when the user explicitly invokes AI drafting.

## What The Extension Does Not Do

- It does not sell stored data.
- It does not require a separate Frelancia account.
- It does not send browser history outside the declared host permissions.

## User-Controlled Actions

- Notifications can be disabled from the popup or dashboard.
- Stored extension data can be cleared from browser extension storage.
- SignalR can be disabled by switching to polling mode.

## Publishing Note

For AMO submission, this file can be used as the basis for the listing privacy policy and data disclosure answers. Review the final listing text against the exact backend behavior before submission.
