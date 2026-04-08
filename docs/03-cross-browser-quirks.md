# Cross-Browser Quirks

## Browser Split Implemented In This Repository

The Chrome vs Firefox divergence is implemented in `src/application/background/create-background-services.ts`:

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

`src/infrastructure/offscreen/manager.ts` then:

1. detects whether an offscreen document already exists with `chrome.runtime.getContexts(...)`
2. creates it with `chrome.offscreen.createDocument(...)` if needed
3. uses Chrome offscreen reasons:
   - `AUDIO_PLAYBACK`
   - `DOM_PARSER`
4. sends task envelopes through `browser.runtime.sendMessage(...)`

The task channel is:

- `frelancia:offscreen`

The supported tasks are:

- `audio.play-notification`
- `monitoring.parse-listing-html`
- `monitoring.parse-project-html`

The offscreen page implementation lives in `src/ui/offscreen.ts`, which dispatches:

- `audio.play-notification` -> `playNotificationAudioDirect()`
- `monitoring.parse-listing-html` -> `getPlatformMonitoringHtmlParser(platformId).parseListingHtml(...)`
- `monitoring.parse-project-html` -> `getPlatformMonitoringHtmlParser(platformId).parseProjectHtml(...)`

## Firefox: Local Background Path

Firefox does not get:

- the `offscreen` manifest permission
- the offscreen HTML entrypoint

Instead, the same task contract executes locally in the background page context.

Local handlers are registered by:

- `src/infrastructure/audio/service.ts`
- `src/platforms/monitoring-html-parser.ts`

When `createOffscreenManager()` is in `mode: 'local'`, `offscreen.request(...)` does not send a runtime message to another page. It calls the local handler map directly.

## Why This Abstraction Exists

The codebase keeps the rest of the runtime browser-neutral:

- background orchestration talks to audio, monitoring, notifications, storage, and SignalR abstractions
- HTML parsing and audio playback are routed through the offscreen contract
- only the offscreen manager decides whether the work runs in:
  - a Chrome offscreen document
  - a Firefox local handler

This prevents monitoring and notification flows from carrying browser-specific branches.

## Capability Matrix

| Concern | Chrome path | Firefox path |
| --- | --- | --- |
| Audio playback | Offscreen document task | Local handler in background context |
| Listing HTML parsing | Offscreen document task | Local handler in background context |
| Project HTML parsing | Offscreen document task | Local handler in background context |
| Offscreen permission | Requested | Not requested |
| Offscreen entrypoint | Included | Excluded |

## What Is Not Abstracted Here

- AI provider HTTP calls are shared.
- SignalR transport logic is shared.
- Notification creation is shared.
- Platform adapter contracts are shared.

Only audio playback and HTML parsing are routed through the Chrome offscreen bridge.
