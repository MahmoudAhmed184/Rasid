# Cross-Browser Quirks

## Browser Split Implemented In This Repository

The Chrome vs Firefox divergence is implemented in one explicit branch in `entrypoints/background.ts`:

```ts
const offscreen = createOffscreenManager({
  mode: import.meta.env.CHROME ? 'document' : 'local',
  documentPath: '/offscreen.html',
});
```

Everything else builds on top of that abstraction.

## Chrome: MV3 Offscreen Document Path

Chrome receives:

- the `offscreen` permission in `wxt.config.ts`
- the `entrypoints/offscreen/index.html` page
- the `entrypoints/offscreen/main.ts` bootstrap

`entrypoints/offscreen/index.html` is explicitly Chrome-only:

```html
<meta name="wxt.include" content='["chrome"]' />
```

`src/core/offscreen-manager.ts` then:

1. Detects whether an offscreen document already exists with `chrome.runtime.getContexts(...)`.
2. Creates it with `chrome.offscreen.createDocument(...)` if needed.
3. Uses Chrome offscreen reasons:
   - `AUDIO_PLAYBACK`
   - `DOM_PARSER`
4. Sends task envelopes through `browser.runtime.sendMessage(...)`.

The task channel is:

- `frelancia:offscreen`

The supported tasks are:

- `audio.play-notification`
- `dom.parse-jobs`
- `dom.parse-project-details`

The actual offscreen page implementation lives in `src/ui/offscreen.ts`, which listens for those envelopes and dispatches:

- `audio.play-notification` -> `playNotificationAudioDirect()`
- `dom.parse-jobs` -> `parseJobsFromHtml()`
- `dom.parse-project-details` -> `parseProjectDetailsFromHtml()`

## Firefox: Local Background Path

Firefox does not get:

- the `offscreen` manifest permission
- the offscreen HTML entrypoint

Instead, the same task contract is executed locally inside the background context.

`src/core/audio.ts` registers a local handler for:

- `audio.play-notification`

`src/core/dom.ts` registers local handlers for:

- `dom.parse-jobs`
- `dom.parse-project-details`

When `createOffscreenManager()` is in `mode: 'local'`, `offscreen.request(...)` does not message another page. It calls the local handler map directly.

That means Firefox uses the same public interfaces:

- `audio.playNotification()`
- `dom.parseJobs(html)`
- `dom.parseProjectDetails(html)`

but without a Chrome offscreen document.

## Why This Abstraction Exists

The codebase keeps the background orchestration layer browser-neutral:

- `background.ts` always talks to `audio` and `dom`
- `audio` and `dom` always talk to the offscreen manager
- the offscreen manager chooses either:
  - Chrome document RPC
  - Firefox local execution

This prevents the rest of the notification, polling, and SignalR code from needing browser-specific branches.

## Capability Matrix

| Concern | Chrome path | Firefox path |
| --- | --- | --- |
| Audio playback | Offscreen document task | Local handler in background context |
| HTML feed parsing | Offscreen document task | Local handler in background context |
| Project detail parsing | Offscreen document task | Local handler in background context |
| Offscreen permission | Requested | Not requested |
| Offscreen entrypoint | Included | Excluded |

## What Is Not Abstracted Here

- AI provider API calls are not browser-specific.
- SignalR transport logic is not browser-specific in repository code.
- Notification creation is shared.
- Mostaql content scripts are shared.

Only audio playback and HTML parsing are routed through the Chrome offscreen bridge.
