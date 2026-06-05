# Source Reference: Features - Proposals, Backup, Settings

Runtime context: background proposal generation, dashboard prompt/settings/backup UI, platform content scripts.

## Proposal Generation

### `src/features/proposals/generate-proposal.ts`

Purpose: chooses bridge or direct proposal generation based on settings.

Functions:

| Function                                      | Purpose                                                                    | Inputs                                                                             | Outputs                    | Side effects, errors, security                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generateProposal(deps, templateId, context)` | Resolves settings/template and dispatches to bridge or unsafe direct mode. | settings repository, template catalog, optional providers, template ID, AI context | `GenerateProposalResponse` | Reads settings/prompts; returns error for unknown template; falls back to bridge when unsafe direct flag or provider host permission is missing. |
| `createProposalGenerator(deps)`               | Wraps `generateProposal()` in a service object.                            | dependencies                                                                       | `ProposalGenerator`        | No side effects until `generate()` is called.                                                                                                    |

### `src/features/proposals/generate-bridge-proposal.ts`

Purpose: renders a bridge-mode prompt.

Functions:

| Function                        | Purpose                          | Inputs                                                   | Outputs                           | Side effects, errors, security                                                    |
| ------------------------------- | -------------------------------- | -------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `generateBridgeProposal(input)` | Creates ChatGPT bridge response. | settings with `aiChatUrl`, resolved template, AI context | bridge `GenerateProposalResponse` | Normalizes ChatGPT URL; includes trusted instruction section and rendered prompt. |

### `src/features/proposals/generate-direct-proposal.ts`

Purpose: calls selected direct provider adapter.

Constants:

- `DEFAULT_DIRECT_PROPOSAL_MAX_OUTPUT_TOKENS = 900`
- `DEFAULT_DIRECT_PROPOSAL_TEMPERATURE = 0.4`

Functions:

| Function                              | Purpose                                                                                | Inputs                                 | Outputs                                 | Side effects, errors, security                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `generateDirectProposal(deps, input)` | Validates direct settings, renders prompt, calls provider, returns generated proposal. | providers, settings, template, context | direct/error `GenerateProposalResponse` | Requires API key/model; catches provider errors through `formatAiProviderError()`. |

### `src/features/proposals/ai-provider-host-permissions.ts`

Purpose: unsafe direct-AI optional host permission helper.

Exports:

- `AI_PROVIDER_HOST_PERMISSIONS`
- `isUnsafeDirectAiEnabled()`
- `getAiProviderHostPermission()`
- `hasAiProviderHostPermission()`
- `requestAiProviderHostPermission()`

Functions:

| Function                                      | Purpose                                | Inputs      | Outputs            | Side effects, errors, security                            |
| --------------------------------------------- | -------------------------------------- | ----------- | ------------------ | --------------------------------------------------------- |
| `isUnsafeDirectAiEnabled()`                   | Checks unsafe direct-AI build flag.    | none        | boolean            | Reads `import.meta.env.WXT_ENABLE_UNSAFE_DIRECT_AI`.      |
| `getAiProviderHostPermission(providerId)`     | Maps provider to optional origin.      | provider ID | origin string      | Pure lookup.                                              |
| `hasAiProviderHostPermission(providerId)`     | Checks granted optional provider host. | provider ID | `Promise<boolean>` | Uses `browser.permissions.contains`; false if absent.     |
| `requestAiProviderHostPermission(providerId)` | Requests optional provider host.       | provider ID | `Promise<boolean>` | Uses `browser.permissions.request`; false if unsupported. |

## Prompt Templates

### `src/features/proposals/prompt-template-registry.ts`

Purpose: converts `AiRequestContext` into trusted system/user prompt text.

Functions:

| Function                                  | Purpose                                       | Inputs                    | Outputs              | Side effects, errors, security                    |
| ----------------------------------------- | --------------------------------------------- | ------------------------- | -------------------- | ------------------------------------------------- |
| `cleanText(value)`                        | Normalizes string fields.                     | unknown                   | string               | Trims strings, returns empty otherwise.           |
| `wrapUntrustedField(field, value)`        | Delimits platform-provided data.              | prompt variable, value    | string               | Adds untrusted markers; empty values stay empty.  |
| `joinTags(tags)`                          | Converts tag input to string.                 | string/string[]/undefined | string               | Trims and filters.                                |
| `joinAttachments(attachments)`            | Converts attachment metadata to display text. | attachments               | string               | Uses names only, not URLs.                        |
| `interpolate(template, values)`           | Replaces `{variable}` tokens.                 | template, values          | string               | Unknown variables become empty strings.           |
| `buildPromptVariables(context)`           | Builds wrapped variable map.                  | AI context                | variable map         | Treats all platform data as untrusted.            |
| `renderPromptTemplate(template, context)` | Produces normalized AI prompt.                | template record, context  | `NormalizedAiPrompt` | Separates system/user text and returns variables. |

### `src/features/proposals/proposal-template-catalog.ts`

Purpose: resolves stored prompt templates to AI prompt records.

Functions:

| Function                                               | Purpose                                                  | Inputs                    | Outputs                   | Side effects, errors, security                    |
| ------------------------------------------------------ | -------------------------------------------------------- | ------------------------- | ------------------------- | ------------------------------------------------- |
| `resolvePromptTemplate(templates, templateId)`         | Selects requested template or default proposal template. | template list, ID         | prompt or `null`          | Pure selection.                                   |
| `toPromptTemplateRecord(template, sharedSystemPrompt)` | Converts stored prompt to AI template record.            | prompt, system prompt     | prompt record             | Uses shared system prompt as trusted system text. |
| `createProposalTemplateCatalog(storage)`               | Creates catalog service.                                 | storage with `getPrompts` | `ProposalTemplateCatalog` | Reads stored prompts and falls back to defaults.  |

### `src/features/proposals/prompt-repository.ts`

Purpose: CRUD repository for prompt templates.

Functions:

| Function                          | Purpose                   | Inputs            | Outputs            | Side effects, errors, security                                  |
| --------------------------------- | ------------------------- | ----------------- | ------------------ | --------------------------------------------------------------- |
| `clonePrompt(prompt)`             | Copies prompt object.     | prompt            | prompt             | Avoids reference reuse.                                         |
| `createPromptRepository(storage)` | Builds prompt repository. | extension storage | `PromptRepository` | Reads/writes `prompts`; uses `crypto.randomUUID()` for new IDs. |

Repository methods:

- `list()`
- `getById(id)`
- `save(draft)`
- `remove(id)`

### `src/features/proposals/proposal-repository.ts`

Purpose: proposal template, pending bridge prompt, and autofill draft repository.

Functions:

| Function                                    | Purpose                                                                       | Inputs                              | Outputs              | Side effects, errors, security                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `createProposalRepository(storage, client)` | Builds proposal repository over extension storage and proposal-state storage. | `ExtensionStorage`, `StorageClient` | `ProposalRepository` | Registers storage change listeners for pending bridge prompts; reads/writes autofill and bridge state. |

Repository methods:

- `getQuickTemplate()`
- `setQuickTemplate(template)`
- `getPendingBridgePrompt()`
- `setPendingBridgePrompt(prompt, chatUrl?)`
- `clearPendingBridgePrompt(id?)`
- `onPendingBridgePromptChanged(listener)`
- `getQueuedAutofill(platformId)`
- `queueAutofill(draft)`
- `clearQueuedAutofill(platformId)`

### `src/features/proposals/proposal-contract.ts`

Purpose: runtime proposal request/response types.

Exports:

- `GenerateProposalRequest`
- `GenerateProposalResponse`

No functions.

### `src/features/proposals/prompt-types.ts`

Purpose: AI prompt template record type.

Exports:

- `PromptTemplateRecord`

No functions.

### `src/features/proposals/prompt-variables.ts`

Purpose: feature-facing re-export of `AI_PROMPT_VARIABLES` and `AiPromptVariable` from `src/entities/ai/prompt.ts`. No functions are defined in this file.

## Backup

### `src/features/backup/repository.ts`

Purpose: backup export/import repository.

Constants:

- `BACKUP_KEYS`
- `BACKUP_SCHEMA_VERSION = 1`
- `BACKUP_CONTENT_KEYS`

Functions:

| Function                                     | Purpose                                          | Inputs                                     | Outputs            | Side effects, errors, security                                                                                                     |
| -------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `hasRecognizedBackupContent(snapshot)`       | Checks whether backup has recognized keys.       | object                                     | boolean            | Rejects unrelated JSON objects.                                                                                                    |
| `assertSupportedBackup(snapshot)`            | Validates schema version and recognized content. | object                                     | throws/void        | Throws on unsupported version or invalid payload.                                                                                  |
| `createBackupRepository(client, aiSecrets?)` | Builds backup repository.                        | storage client, optional AI secret clearer | `BackupRepository` | Export normalizes state and omits secret bridge prompt; import normalizes state, clears stale proposal keys, and clears AI secret. |

Repository methods:

- `exportAll()`
- `importAll(snapshot)`

## Settings

### `src/features/settings/repository.ts`

Purpose: simple repository wrapper around settings storage methods.

Functions:

| Function                            | Purpose                      | Inputs            | Outputs              | Side effects, errors, security                    |
| ----------------------------------- | ---------------------------- | ----------------- | -------------------- | ------------------------------------------------- |
| `createSettingsRepository(storage)` | Creates settings repository. | extension storage | `SettingsRepository` | Delegates `get`, `save`, and `update` to storage. |

Related docs:

- [`../../10-ai-proposals-and-chatgpt-bridge.md`](../../10-ai-proposals-and-chatgpt-bridge.md)
- [`../../06-storage-and-state.md`](../../06-storage-and-state.md)
