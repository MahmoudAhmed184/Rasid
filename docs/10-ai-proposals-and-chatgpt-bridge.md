# AI Proposals And ChatGPT Bridge

Rasid supports two AI proposal paths: direct provider mode and bridge mode.

## Prompt Templates

Prompt templates are stored in `prompts` and managed through:

- `src/features/proposals/prompt-repository.ts`
- `src/features/proposals/proposal-template-catalog.ts`
- `src/features/proposals/prompt-template-registry.ts`

The default prompt and shared system prompt are defined in `src/shared/storage/schema.ts`.

## Prompt Variables

`renderPromptTemplate()` supports these variables:

- `title`
- `description`
- `url`
- `tags`
- `client_name`
- `client_type`
- `budget`
- `duration`
- `publish_date`
- `project_id`
- `project_status`
- `category`
- `hiring_rate`
- `open_projects`
- `underway_projects`
- `client_joined`
- `communications`
- `attachments`

Each variable value is wrapped with `[[BEGIN_UNTRUSTED_<FIELD>]]` and `[[END_UNTRUSTED_<FIELD>]]` before interpolation.

## Direct Mode

Direct mode runs when `settings.aiExecutionMode === "direct"`.

Requirements:

- `settings.aiApiKey`
- `settings.aiModel`
- supported `settings.aiProvider`

Provider endpoints:

| Provider | Endpoint                                                                               | Key transport                    |
| -------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| OpenAI   | `POST https://api.openai.com/v1/responses`                                             | `authorization: Bearer <apiKey>` |
| Gemini   | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `x-goog-api-key: <apiKey>`       |
| Claude   | `POST https://api.anthropic.com/v1/messages`                                           | `x-api-key: <apiKey>`            |

Direct-mode defaults:

- `maxOutputTokens: 900`
- `temperature: 0.4`
- provider timeout: 45 seconds

Provider errors are categorized as authentication, empty output, network, provider, rate limit, safety, server, or timeout.

## Bridge Mode

Bridge mode runs when the AI execution mode is not `direct`.

Behavior:

1. Render the selected prompt locally.
2. Combine trusted instructions, system prompt, and user/project data.
3. Normalize the ChatGPT URL to `https://chatgpt.com/` or `https://chat.openai.com/`.
4. Store a pending bridge prompt in `browser.storage.local`.
5. Open the ChatGPT URL.
6. The bridge content script writes the prompt into the ChatGPT input and clears the matching record.

The bridge does not send the prompt to a provider API itself and does not click submit.

## API Key Storage

Direct-mode keys are stored in `browser.storage.session` under `aiApiKeySecret`.

Current behavior:

- persistent `settings.aiApiKey` is sanitized to an empty string
- legacy persistent keys are migrated into session storage and removed from settings
- backup export omits API keys
- backup import clears the current session key
- the value is not encrypted before browser storage writes

## Privacy Notes

Direct mode sends prompt content to the selected provider. Prompt content may include project title, description, URL, tags, client metadata, budget, duration, status, category, and attachment names.

Bridge mode stores prompt content locally for short-lived delivery to the ChatGPT content script, then writes it into the ChatGPT page for user review.

Related docs:

- [`17-privacy-and-security-model.md`](17-privacy-and-security-model.md)
- [`19-ai-provider-maintenance.md`](19-ai-provider-maintenance.md)
- [`reference/source/features-proposals.md`](reference/source/features-proposals.md)
