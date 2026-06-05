# AI Provider Maintenance

## Provider Modules

| Provider       | File                                   |
| -------------- | -------------------------------------- |
| OpenAI         | `src/entities/ai/providers/openai.ts`  |
| Gemini         | `src/entities/ai/providers/gemini.ts`  |
| Claude         | `src/entities/ai/providers/claude.ts`  |
| Shared helpers | `src/entities/ai/providers/shared.ts`  |
| Registry       | `src/entities/ai/provider-registry.ts` |

## Adding Or Changing A Provider

Required updates:

- `AiProviderId` in `src/entities/ai/model.ts`
- provider adapter implementation
- `createAiProviderRegistry()`
- settings normalization and dashboard UI if user-selectable
- unsafe-direct optional host permissions in `wxt.config.ts`
- privacy docs and store-review notes
- direct-mode tests or provider mock tests where practical

Normal builds must not emit provider host permissions or expose dashboard direct controls. Direct providers are loaded only when `WXT_ENABLE_UNSAFE_DIRECT_AI=true`.

## Provider Error Requirements

Provider failures should use `AiProviderError` with:

- provider ID
- category
- sanitized message
- optional status
- optional code
- optional request ID
- optional retry-after

Do not include API keys or raw prompts in errors or logs.

## Prompt Safety Requirements

Keep:

- shared system prompt
- untrusted field delimiters
- attachment URL omission from prompt variables
- direct-mode output token and temperature defaults unless deliberately changed
- bridge mode user-mediated submission behavior

## Bridge Maintenance

Allowed bridge hosts are defined in `src/entities/ai/chat-url.ts`.

If bridge hosts change:

- update `AI_CHAT_HOSTS`
- update `wxt.config.ts` host permissions
- update `entrypoints/chatgpt-bridge.ts`
- update the background `openChatBridgePrompt` permission/injection path
- update validation tests
- update privacy and store-review docs
- rebuild and inspect generated manifests

Related docs:

- [`10-ai-proposals-and-chatgpt-bridge.md`](10-ai-proposals-and-chatgpt-bridge.md)
- [`reference/source/entities.md`](reference/source/entities.md)
