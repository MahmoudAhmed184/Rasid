# AI Content Bridge

## Entry Surface On Supported Platforms

The AI workflow starts on supported project or request pages.

The content entrypoints bootstrap:

- `entrypoints/mostaql.content/index.ts`
- `entrypoints/khamsat.content/index.ts`
- `src/app/content/createPlatformContentServices.ts`
- `src/app/content/bootstrapPlatformContent.ts`
- `src/app/content/bootstrapPlatformAutofill.ts`
- the concrete platform adapter exported from `src/platforms/<platform>/index.ts`

The entrypoints create browser repositories inside the WXT `main()` callback, build explicit `PlatformContentServices`, import the concrete platform adapter directly, then hand control to the shared content runtime.

## Prompt Source

Prompt templates are exposed to platform UI code through `PlatformContentServices`.

Those services are backed by:

- `src/shared/browser/browser-repositories.ts`
- `src/features/proposals/prompt-repository.ts`
- `src/features/proposals/proposal-repository.ts`
- `src/features/monitoring/tracking-repository.ts`

This means platform UI code does not need to import storage singletons or raw background message helpers directly.

## DOM Data Extracted From Platform Pages

The Mostaql proposal context comes from:

- `extractProjectData()`
- `getProjectDescription()`

in `src/platforms/mostaql/content/data.ts`.

Khamsat proposal context is extracted through:

- `extractKhamsatProposalSource(...)`

in `src/platforms/khamsat/content/data.ts`.

Typical fields collected into `AiRequestContext` include:

- title
- description
- url
- tags
- client name
- budget
- duration
- publish date
- project ID
- category
- hiring rate
- open projects
- underway projects
- client joined
- communications
- attachments

If the page extractor cannot produce a valid proposal source, the AI flow stops on the page and the action is not sent to the background.

## Message Sent To Background

When the user clicks an AI action, the content script calls:

- `requestGenerateProposal(...)`

from `src/app/background/background-messages.ts`.

The payload shape is:

```ts
{
    action: 'generateProposal',
    templateId,
    context: AiRequestContext,
}
```

That request crosses the typed runtime message bus and is handled in the background by:

- `src/app/background/background-runtime-handlers.ts`
- `src/features/proposals/generate-proposal.ts`

## Background AI Handling

The background proposal path is split across:

- `src/features/proposals/generate-proposal.ts`
- `src/features/proposals/generate-direct-proposal.ts`
- `src/features/proposals/generate-bridge-proposal.ts`
- `src/features/proposals/proposal-template-catalog.ts`
- `src/entities/ai/providers/*`

### Direct mode

Direct mode is used when:

- `settings.aiExecutionMode === 'direct'`

Requirements enforced by code:

- `settings.aiApiKey` must exist
- `settings.aiModel` must exist

The background resolves the selected prompt template, renders it, and delegates to one provider:

- `openai`
- `gemini`
- `claude`

### Bridge mode

Bridge mode is used when:

- `settings.aiExecutionMode !== 'direct'`

The background does not call an AI API in this mode.

Instead it returns:

- `mode: 'bridge'`
- `prompt`
- `chatUrl`

The originating content script then stores the prompt through:

- `proposalRepository.setPendingBridgePrompt(...)`

and opens the configured chat URL.

## ChatGPT DOM Bridge

The bridge entrypoint is:

- `entrypoints/chatgpt-bridge.content.ts`

It matches:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

`src/app/chatgpt-bridge/index.ts`:

1. reads the pending prompt from repository state
2. waits for the chat input to appear
3. writes the prompt into:
    - `#prompt-textarea`, or
    - `[contenteditable="true"]`, or
    - fallback textarea selectors
4. dispatches an `input` event

The bridge does not click the send button. Actual submission still requires user action on the chat site.

## Direct Proposal Autofill

When direct mode returns a generated proposal, the content script queues autofill through:

- `proposalRepository.queueAutofill(...)`

The shared content autofill bootstrap then checks the current page and gives the platform adapter a chance to apply the draft through:

- `PlatformAdapter.applyProposalAutofill(...)`

This keeps page-specific form writing inside the platform adapter instead of inside the background or generic bridge code.
