# AI Content Bridge

## Entry Surface On Mostaql

The AI workflow starts on Mostaql project pages.

`entrypoints/mostaql.content/index.ts` routes project pages to `injectTrackButton()`, which injects three controls into `#project-meta-panel`:

- `مراقبة`
- `سريع`
- `ذكاء`

The AI button group is created in `src/ui/mostaql/project-sidebar.mjs`:

- main button id: `chatgpt-main-btn`
- dropdown container id: `chatgpt-group`
- default prompt id: `default_proposal`

Prompt templates are loaded from `browser.storage.local.prompts`. If that key is empty, the content script asks the background for `getDefaultPrompts` and stores the returned defaults locally.

## DOM Data Extracted From Mostaql

The proposal context comes from `extractProjectData()` plus `getProjectDescription()` in `src/ui/mostaql/data.mjs`.

### Core selectors

- Status label:
  - `.label-prj-open`
  - `.label-prj-closed`
  - `.label-prj-completed`
  - `.label-prj-cancelled`
  - `.label-prj-underway`
  - `.label-prj-processing`

- Meta rows:
  - `.meta-row`
  - `.table-meta tr`
  - `.card .table tr`
  - `li.meta-item`

- Meta labels inside those rows:
  - `.meta-label`
  - `td:first-child`
  - `.meta-item-label`

- Meta values inside those rows:
  - `.meta-value`
  - `td:last-child`
  - `.meta-item-value`

- Budget:
  - `[data-type="project-budget_range"]`
  - `#project-meta-panel .meta-value[data-type="project-budget_range"]`

- Publish date:
  - `time[itemprop="datePublished"]`
  - `#project-meta-panel time`

- Sidebar tags:
  - `#project-meta-panel .tag`

- Client name:
  - `.profile__name bdi`

- Category:
  - `.breadcrumb-item[data-index="2"]`

- Client card:
  - `.profile_card`
  - `.profile_card .table-meta tr`
  - `.profile_card .meta_items li`

- General tags:
  - `.skills .tag`
  - `.tags .tag`
  - `.project-tags .tag`

- Title:
  - `.heada__title span[data-type="page-header-title"]`
  - `.page-title h1`
  - `.project-title`

- Attachments:
  - `#projectDetailsTab #project-files-panel .attachment a[href]`

### Description selectors

`getProjectDescription()` reads:

- container:
  - `#projectDetailsTab`
  - `#project-brief`

- main body:
  - `.carda__content`
  - `.text-wrapper-div:not(.field-label)`

- detail rows:
  - `.pdn--ts`
  - `.row > div`

- per-row fields:
  - `.field-label`
  - `.text-wrapper-div:not(.field-label)`

If no description is found, the AI flow stops and alerts the user.

## Message Sent To Background

When the user clicks the AI button, the content script sends:

```ts
browser.runtime.sendMessage({
  action: 'generateProposal',
  templateId,
  context: {
    title,
    url,
    description,
    tags,
    clientName,
    budget,
    duration,
    publishDate,
    projectStatus,
    projectId,
    category,
    hiringRate,
    openProjects,
    underwayProjects,
    clientJoined,
    clientType,
    communications,
  },
})
```

That `context` shape matches `AiRequestContext` in `src/models/ai.ts`.

## Background AI Handling

`entrypoints/background.ts` resolves the selected template from:

- `storage.getSnapshot().prompts`, or
- `DEFAULT_PROMPTS`

Then it chooses one of two execution modes from `settings.aiExecutionMode`.

### Direct mode

Requirements enforced by code:

- `settings.aiApiKey` must exist
- `settings.aiModel` must exist

The background then creates an AI gateway and sends the rendered prompt to one provider:

- `openai`
- `gemini`
- `claude`

#### OpenAI request

Endpoint:

- `POST https://api.openai.com/v1/responses`

Payload:

- `model`
- `instructions`
- `input`
- optional `temperature`
- optional `max_output_tokens`
- optional `metadata`

#### Gemini request

Endpoint:

- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`

Payload:

- `systemInstruction.parts[].text`
- `contents[].parts[].text`
- optional `generationConfig.temperature`
- optional `generationConfig.maxOutputTokens`

#### Claude request

Endpoint:

- `POST https://api.anthropic.com/v1/messages`

Payload:

- `model`
- `system`
- `messages`
- `temperature`
- `max_tokens`

Headers also include:

- `x-api-key`
- `anthropic-version: 2023-06-01`
- `anthropic-dangerous-direct-browser-access: true`

### Bridge mode

The background does not call an AI API.

Instead it returns:

- `mode: 'bridge'`
- `prompt: renderLegacyPromptTemplate(...)`
- `chatUrl: settings.aiChatUrl || 'https://chatgpt.com/'`

The content script then writes:

- `browser.storage.local.set({ pendingChatGptPrompt: response.prompt })`

and opens:

- `window.open(response.chatUrl || 'https://chatgpt.com/', 'mostaql_ai_chat')`

## ChatGPT DOM Bridge

The bridge entrypoint is `entrypoints/chatgpt-bridge.content.ts`.

It matches:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

`src/ui/chatgpt-bridge/index.mjs` looks for the chat input with these selectors, in order:

- `#prompt-textarea`
- `[contenteditable="true"]`
- `textarea[data-id="root"]`
- `textarea`

Behavior:

1. Read `pendingChatGptPrompt` from `browser.storage.local`.
2. Retry up to 20 times, every 500 ms, until an input is found.
3. If the target is contenteditable, set:
   - `innerHTML = <p>...</p>`
4. If the target is a textarea, use the native `HTMLTextAreaElement.value` setter when available, otherwise assign `value`.
5. Dispatch one bubbled `input` event.

The bridge also listens to `browser.storage.onChanged` so a reused ChatGPT tab can receive a new prompt without a full reload.

### What the bridge does not do

- It does not click the send button.
- It does not submit the chat automatically.
- It does not remove `pendingChatGptPrompt` after injection.
- It does not provide a DOM bridge for Gemini or Claude.

Gemini DOM bridge: Not implemented in current codebase.

Claude DOM bridge: Not implemented in current codebase.

## How Direct Mode Returns To Mostaql

When the background returns `mode: 'direct'`, the Mostaql content script calls `queueProposalAutofill(...)`.

The autofill queue is stored under:

- `mostaql_pending_autofill`

`src/ui/mostaql/autofill.mjs` then fills the bid form by probing these selectors:

- Amount:
  - `input[name="cost"]`
  - `input[name="amount"]`
  - `#bid__cost`
  - `#amount`

- Duration:
  - `input[name="period"]`
  - `input[name="duration"]`
  - `#bid__period`
  - `#duration`

- Proposal body:
  - `#bid__details`
  - `#description`
  - `textarea[name="details"]`
  - `textarea[name="description"]`
  - `#proposal-description`

- Form container:
  - `#add-proposal-form`

The extension dispatches focus, input, change, and keyboard events after writing values so Mostaql’s own form logic reacts to the injected content.
