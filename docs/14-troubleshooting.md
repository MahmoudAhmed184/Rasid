# Troubleshooting

## Install And Build

| Symptom                                          | Cause to check                       | Action                                                                                 |
| ------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------- |
| TypeScript cannot find WXT types                 | `.wxt/` missing                      | Run `npm ci` or `npm run postinstall`.                                                 |
| Firefox lint fails because source dir is missing | `dist/firefox-mv3` not built         | Run `npm run build:firefox`.                                                           |
| Build emits Firefox offscreen skip warning       | Chrome-only offscreen entrypoint     | Expected because offscreen is Chrome-only in this repo.                                |
| Prettier checks backend files                    | `.prettierignore` changed or ignored | Confirm `server/` remains ignored unless backend formatting is intentionally in scope. |

## Runtime

| Symptom                          | Check                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| No notifications                 | Browser notification permission, dashboard notification state, quiet hours, filters, and platform toggles.  |
| Manual check returns no jobs     | Popup diagnostics and dashboard runtime monitoring errors.                                                  |
| Realtime never connects          | Default backend reachability and `notificationMode`; packaged build does not accept custom SignalR origins. |
| Polling only mode stays active   | `notificationMode === "polling"` or SignalR fallback state.                                                 |
| Notification click does not open | Stored notification payload may be expired, consumed, or URL may fail supported HTTPS host validation.      |

## AI And Bridge

| Symptom                                           | Check                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Direct mode says API key required                 | Dashboard direct-mode API key field and session storage lifetime.                                  |
| Direct mode says model required                   | Dashboard model field.                                                                             |
| Provider returns authentication/rate/safety error | Provider key, model, quota, and provider policy.                                                   |
| Bridge prompt does not appear                     | ChatGPT URL host, prompt expiry, content script match, and whether the ChatGPT input is available. |
| Bridge prompt appears but is not sent             | Expected current behavior; the extension does not click submit.                                    |

## Content Scripts

| Symptom                          | Check                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Platform panel does not appear   | Platform URL, adapter `matchPage()`, target selectors, and deferred mount readiness. |
| Autofill does not apply          | Current page project ID must match the queued draft project ID.                      |
| Autofill retries                 | Target form fields are not ready yet.                                                |
| Autofill clears without applying | Draft expired or belongs to another page.                                            |

## Export And Downloads

| Symptom                                          | Check                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| ZIP export contains `.error.txt` entries         | Individual attachment fetch failed, was too large, used an unsupported host, or timed out. |
| ZIP download starts but Blob URL remains pending | Download cleanup service reconciles on startup and download completion/interruption.       |
| Export skips entries                             | ZIP entry count is capped at 80.                                                           |

## Diagnostics Commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run lint:firefox
```

Targeted scans:

```bash
rg -n "mostaql|khamsat|nafezly" README.md docs src entrypoints wxt.config.ts
rg -n "pendingChatGptPrompt|aiApiKeySecret|signalrServerUrl" src README.md PRIVACY.md docs
```

Related docs:

- [`08-background-runtime.md`](08-background-runtime.md)
- [`10-ai-proposals-and-chatgpt-bridge.md`](10-ai-proposals-and-chatgpt-bridge.md)
