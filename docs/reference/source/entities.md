# Source Reference: Entities

Runtime context: shared domain code imported by background, UI, content scripts, features, storage, and tests.

## AI Entities

### `src/entities/ai/model.ts`

Purpose: AI provider and request context types.

Exports:

- `AiProviderId = "openai" | "gemini" | "claude"`
- `AiRequestContext`

No runtime functions.

### `src/entities/ai/prompt.ts`

Purpose: prompt variable model.

Exports:

- `AI_PROMPT_VARIABLES`
- `AiPromptVariable`
- `NormalizedAiPrompt`

No functions.

### `src/entities/ai/chat-url.ts`

Purpose: allowed ChatGPT bridge URL normalization.

Constants:

- `DEFAULT_AI_CHAT_URL = "https://chatgpt.com/"`
- `AI_CHAT_HOSTS = ["chatgpt.com", "chat.openai.com"]`

Functions:

| Function                        | Purpose                                | Inputs     | Outputs    | Side effects, errors, security                                                   |
| ------------------------------- | -------------------------------------- | ---------- | ---------- | -------------------------------------------------------------------------------- |
| `isAllowedAiChatHost(hostname)` | Checks exact allowed ChatGPT host.     | hostname   | boolean    | Host allowlist; no subdomain matching.                                           |
| `normalizeAiChatUrl(value)`     | Normalizes bridge URL.                 | unknown    | URL string | Requires HTTPS and allowed host; strips credentials/hash; falls back to default. |
| `getAiChatTargetHost(chatUrl)`  | Returns normalized bridge target host. | URL string | hostname   | Falls back to default host on parse failure.                                     |

### `src/entities/ai/provider-adapter.ts`

Purpose: provider adapter contracts and provider error formatting.

Exports:

- `FetchLike`
- `AiProviderRequest`
- `AiProviderResponse`
- `AiProviderErrorCategory`
- `AiProviderErrorOptions`
- `AiProviderError`
- `AiProviderAdapter`
- `getDefaultFetch()`
- `formatAiProviderError()`

Functions/classes:

| Function/class                 | Purpose                                            | Inputs                                                     | Outputs        | Side effects, errors, security                                |
| ------------------------------ | -------------------------------------------------- | ---------------------------------------------------------- | -------------- | ------------------------------------------------------------- |
| `AiProviderError` constructor  | Stores sanitized provider error metadata.          | provider/category/message/status/code/requestId/retryAfter | error instance | Does not store prompt or API key.                             |
| `getDefaultFetch()`            | Returns bound global `fetch`.                      | none                                                       | `FetchLike`    | Throws when `fetch` is unavailable.                           |
| `formatAiProviderError(error)` | Converts provider errors into user-facing strings. | unknown error                                              | string         | Includes status/code/retry metadata but not raw prompts/keys. |

### `src/entities/ai/provider-registry.ts`

Purpose: direct AI provider registry.

Normal builds do not load this registry. It is imported by the background proposal generator only in unsafe side builds with `WXT_ENABLE_UNSAFE_DIRECT_AI=true`.

Functions:

| Function                                                  | Purpose                                      | Inputs                        | Outputs                     | Side effects, errors, security                   |
| --------------------------------------------------------- | -------------------------------------------- | ----------------------------- | --------------------------- | ------------------------------------------------ |
| `createAiProviderRegistry(fetchImpl = getDefaultFetch())` | Creates OpenAI, Gemini, and Claude adapters. | optional fetch implementation | record keyed by provider ID | No network until adapter `generate()` is called. |

### `src/entities/ai/providers/shared.ts`

Purpose: shared HTTP/error/output helpers for direct AI providers.

Constants:

- `DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 45_000`
- `GEMINI_SAFETY_FINISH_REASONS`

Functions:

| Function                                                        | Purpose                                          | Inputs                                           | Outputs            | Side effects, errors, security                                      |
| --------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------ | ------------------ | ------------------------------------------------------------------- |
| `isObject(value)`                                               | Object type guard.                               | unknown                                          | boolean/type guard | Internal validation.                                                |
| `withoutUndefined(value)`                                       | Drops undefined object properties.               | object                                           | object             | Used for compact JSON bodies/error metadata.                        |
| `parseResponsePayload(response)`                                | Reads response text and parses JSON if possible. | `Response`                                       | unknown            | Consumes response body.                                             |
| `extractErrorMessage(payload)`                                  | Extracts provider error message.                 | unknown payload                                  | string or `null`   | Avoids raw body leakage beyond provider message fields.             |
| `extractErrorCode(payload)`                                     | Extracts provider error code/status/type.        | unknown payload                                  | string/undefined   | Metadata only.                                                      |
| `classifyStatus(status)`                                        | Maps HTTP status to error category.              | status number                                    | category           | 401/403 auth, 429 rate limit, 5xx server.                           |
| `getHeader(response, names)`                                    | Reads first available response header.           | response, header names                           | string/undefined   | Used for retry/request IDs.                                         |
| `fetchWithTimeout(provider, fetchImpl, input, init, timeoutMs)` | Runs provider fetch with abort timeout.          | provider, fetch, request, init, optional timeout | `Response`         | Throws categorized timeout/network `AiProviderError`; clears timer. |
| `parseJsonResponse(provider, response)`                         | Parses provider JSON/text and throws on non-OK.  | provider, response                               | payload            | Throws `AiProviderError` with sanitized metadata.                   |
| `collectTextParts(value)`                                       | Recursively extracts text-ish fields.            | unknown                                          | string array       | Internal output parsing.                                            |
| `extractOpenAiOutput(payload)`                                  | Extracts OpenAI output text.                     | payload                                          | string             | Handles `output_text`, `output`, and `choices`.                     |
| `extractGeminiOutput(payload)`                                  | Extracts Gemini output text.                     | payload                                          | string             | Throws safety `AiProviderError` for safety/block finish reasons.    |
| `extractClaudeOutput(payload)`                                  | Extracts Claude content text.                    | payload                                          | string             | Reads content parts.                                                |
| `ensureOutput(provider, output)`                                | Requires non-empty output.                       | provider, output                                 | trimmed output     | Throws `empty_output` provider error.                               |

### Provider Adapters

| File                                  | Function                                             | Purpose                 | Network behavior                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/entities/ai/providers/openai.ts` | `createOpenAiAdapter(fetchImpl = getDefaultFetch())` | Creates OpenAI adapter. | `POST https://api.openai.com/v1/responses`, `authorization: Bearer`, JSON body with model/instructions/input/temperature/max_output_tokens/metadata.                  |
| `src/entities/ai/providers/gemini.ts` | `createGeminiAdapter(fetchImpl = getDefaultFetch())` | Creates Gemini adapter. | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, `x-goog-api-key`, JSON body with systemInstruction/contents/generationConfig. |
| `src/entities/ai/providers/claude.ts` | `createClaudeAdapter(fetchImpl = getDefaultFetch())` | Creates Claude adapter. | `POST https://api.anthropic.com/v1/messages`, `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access`, JSON body.                               |

Each adapter exposes `generate(request)`, calls `fetchWithTimeout()`, parses JSON, extracts output, and returns `{ output, raw }` or throws formatted provider errors upstream.

## Job Entities

### `src/entities/job/model.ts`

Purpose: job, project, attachment, and category types.

Exports:

- `JobCategory`
- `ProjectAttachment`
- `JobRecord`
- `TrackedProject`

No runtime functions.

### `src/entities/job/identity.ts`

Purpose: stable keys and platform ID resolution for jobs/tracked projects.

Functions:

| Function                                         | Purpose                                          | Inputs               | Outputs                        | Side effects, errors, security                       |
| ------------------------------------------------ | ------------------------------------------------ | -------------------- | ------------------------------ | ---------------------------------------------------- |
| `resolveJobPlatformId(job)`                      | Resolves platform ID from job platform or URL.   | job platform/url     | platform ID                    | Falls back through platform resolver.                |
| `getJobRecordKey(job)`                           | Creates storage key `platform:id`.               | job id/platform/url  | string                         | Used for dedupe.                                     |
| `resolveTrackedProjectPlatformId(project)`       | Resolves tracked project platform.               | project platform/url | platform ID                    | URL fallback.                                        |
| `createTrackedProjectKey(projectId, platformId)` | Creates `platform:projectId`.                    | ID, platform         | string                         | Storage key helper.                                  |
| `getTrackedProjectKey(project)`                  | Creates tracked project key from project object. | project              | string                         | Requires ID.                                         |
| `parseQualifiedProjectKey(key)`                  | Parses `platform:id` key.                        | string               | `{ platformId, id }` or `null` | Rejects missing separators and unknown platform IDs. |

## Platform Entities

### `src/entities/platform/model.ts`

Purpose: platform IDs, display names, host mapping, and autofill draft type.

Constants:

- `PLATFORM_IDS = ["mostaql", "khamsat", "nafezly"]`
- `PLATFORM_DISPLAY_NAMES`
- internal `PLATFORM_HOSTS`

Functions:

| Function                                | Purpose                                          | Inputs                         | Outputs               | Side effects, errors, security          |
| --------------------------------------- | ------------------------------------------------ | ------------------------------ | --------------------- | --------------------------------------- |
| `isPlatformId(value)`                   | Type guard for known platform IDs.               | unknown                        | boolean/type guard    | Includes unsupported compatibility IDs. |
| `inferSupportedPlatformIdFromUrl(url)`  | Infers platform from URL host.                   | URL string/undefined           | platform ID or `null` | Uses allowed host helper.               |
| `inferPlatformIdFromUrl(url, fallback)` | Infers platform with fallback.                   | URL, fallback                  | platform ID           | Pure helper.                            |
| `resolvePlatformId(value, options)`     | Resolves platform ID from value or URL/fallback. | unknown, optional URL/fallback | platform ID           | Defaults fallback to `mostaql`.         |
| `getPlatformDisplayName(platformId)`    | Returns display name.                            | platform ID                    | string                | Pure lookup.                            |

### `src/entities/platform/url.ts`

Purpose: generic platform URL safety helper.

Functions:

| Function                                            | Purpose                               | Inputs                                                          | Outputs              | Side effects, errors, security                                              |
| --------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `isAllowedPlatformHostname(hostname, allowedHosts)` | Checks exact or subdomain host match. | hostname, allowed hosts                                         | boolean              | Lowercases host.                                                            |
| `resolvePlatformUrl(value, options)`                | Resolves and normalizes platform URL. | string/URL/null, base URL, allowed hosts, optional path pattern | URL string or `null` | Requires HTTPS, allowed host, optional path match; strips credentials/hash. |

## Runtime Entities

### `src/entities/runtime/model.ts`

Purpose: SignalR and monitoring runtime state types.

Exports:

- `SignalRLiveStatus`
- `SignalRFallbackStatus`
- `SignalRStatus`
- state interfaces
- `SignalRState`
- `MonitoringFetchFailure`
- `RuntimeState`

Functions:

| Function                        | Purpose                                   | Inputs        | Outputs    | Side effects, errors, security |
| ------------------------------- | ----------------------------------------- | ------------- | ---------- | ------------------------------ |
| `isSignalRLiveState(state)`     | Narrows connecting/connected states.      | SignalR state | type guard | Pure helper.                   |
| `isSignalRFallbackState(state)` | Narrows polling/backoff/suspended states. | SignalR state | type guard | Pure helper.                   |

### `src/entities/runtime/signalr.ts`

Purpose: default backend URL and safe redaction.

Constants:

- `DEFAULT_SIGNALR_URL = "https://rasid.runasp.net/jobNotificationHub"`

Functions:

| Function                  | Purpose                                             | Inputs     | Outputs | Side effects, errors, security                  |
| ------------------------- | --------------------------------------------------- | ---------- | ------- | ----------------------------------------------- |
| `redactSignalRUrl(value)` | Returns origin/path without credentials/query/hash. | URL string | string  | Falls back to packaged default on parse errors. |

## Settings, Monitoring, Prompt Entities

### `src/entities/settings/model.ts`

Purpose: settings type, supported monitoring platforms, defaults, polling clamps.

Important constants:

- `DEFAULT_POLLING_INTERVAL = 1`
- `MIN_POLLING_INTERVAL = 1`
- `MAX_POLLING_INTERVAL = 30`
- `SUPPORTED_MONITORING_PLATFORM_IDS = ["mostaql", "khamsat", "nafezly"]`
- `DEFAULT_MONITORED_PLATFORMS`

Functions:

| Function                                            | Purpose                                | Inputs                           | Outputs | Side effects, errors, security                        |
| --------------------------------------------------- | -------------------------------------- | -------------------------------- | ------- | ----------------------------------------------------- |
| `clampPollingInterval(value, fallback)`             | Coerces interval into supported range. | unknown value, optional fallback | number  | Truncates finite numeric values; 1 to 30 minutes.     |
| `isPlatformMonitoringEnabled(settings, platformId)` | Checks monitored platform toggle.      | settings, platform ID            | boolean | Defaults to enabled unless value is explicitly false. |

### `src/entities/monitoring/model.ts`

Purpose: `ExtensionStats` interface with `lastCheck`, `todayCount`, and `todayDate`.

No functions.

### `src/entities/prompt/model.ts`

Purpose: `PromptTemplate` interface with `id`, `title`, and `content`.

No functions.

Related docs:

- [`../../10-ai-proposals-and-chatgpt-bridge.md`](../../10-ai-proposals-and-chatgpt-bridge.md)
- [`../../06-storage-and-state.md`](../../06-storage-and-state.md)
