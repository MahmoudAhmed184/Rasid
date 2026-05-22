# Source Reference: App Content And Bridge

Runtime contexts: platform content scripts and ChatGPT bridge content script.

## `src/app/content/bootstrapPlatformContent.ts`

Purpose: mounts platform UI contributions based on current page route.

Constants:

- `DEFAULT_ROUTE_POLL_INTERVAL_MS = 500`

Types:

- `BootstrapPlatformContentOptions`

Functions:

| Function                            | Purpose                                                     | Inputs                                         | Outputs        | Side effects, errors, security                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getCurrentPage(adapter, doc)`      | Computes current `PlatformPage` from document URL.          | platform adapter, document                     | `PlatformPage` | Uses adapter-owned routing logic.                                                                                                                      |
| `bootstrapPlatformContent(options)` | Polls route/page state and mounts adapter UI contributions. | adapter, document, services, optional interval | `void`         | Skips invalid contexts, disposes previous mounted contributions on route change, catches mount errors, defers contributions until selectors are ready. |

## `src/app/content/bootstrapPlatformAutofill.ts`

Purpose: polls queued proposal autofill drafts and applies them to current project pages.

Constants:

- `DEFAULT_AUTOFILL_POLL_INTERVAL_MS = 500`
- `DEFAULT_AUTOFILL_MAX_AGE_MS = 5 * 60 * 1000`

Types:

- `BootstrapPlatformAutofillOptions`

Functions:

| Function                              | Purpose                                                                    | Inputs                                                  | Outputs                | Side effects, errors, security                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `getCurrentProjectPage(adapter, doc)` | Resolves current page and narrows it to project pages.                     | adapter, document                                       | project page or `null` | Returns `null` outside project pages.                                                                                      |
| `bootstrapPlatformAutofill(options)`  | Applies queued autofill drafts when matching form fields become available. | adapter, document, proposal repository, optional timing | `PlatformDisposer`     | Clears expired/not-available/applied drafts; retries when adapter reports field readiness issues; catches and logs errors. |

## `src/app/content/createPlatformContentServices.ts`

Purpose: adapts repositories and background messages into `PlatformContentServices`.

Types:

- `PlatformContentServiceDependencies`

Functions:

| Function                                      | Purpose                                                                        | Inputs                     | Outputs                    | Side effects, errors, security                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalizeProposalGenerationResult(response)` | Converts background proposal response into platform content result.            | `GenerateProposalResponse` | `ProposalGenerationResult` | Maps errors to `{ kind: "error" }`; preserves direct/bridge metadata.                                                                                                               |
| `createPlatformContentServices(deps)`         | Builds prompt/tracking/proposal/download/toast services for platform adapters. | narrowed repositories      | `PlatformContentServices`  | Proposal generation calls validated background message; bridge results are stored with `setPendingBridgePrompt()` and ChatGPT tab is opened; ZIP downloads call background message. |

Browser APIs:

- `window.open` for bridge ChatGPT URL in content context.

## `src/app/chatgpt-bridge/index.ts`

Purpose: reads pending bridge prompts and injects them into ChatGPT input fields.

Types:

- `ChatgptBridgeDependencies`

Functions:

| Function                                    | Purpose                                                   | Inputs                        | Outputs                                                  | Side effects, errors, security                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `findChatInput()`                           | Locates a ChatGPT prompt input.                           | none                          | `HTMLTextAreaElement`, editable `HTMLElement`, or `null` | Searches textareas and contenteditable textbox-like elements.                                                                         |
| `writePromptToEditable(inputField, prompt)` | Writes prompt text to textarea or editable element.       | input element, prompt string  | `void`                                                   | Updates DOM value/text, dispatches `input` and `change` events with bubbling.                                                         |
| `injectPrompt(deps, pendingPrompt?)`        | Injects a pending prompt for the current ChatGPT host.    | repositories, optional prompt | `Promise<void>`                                          | Clears expired/mismatched prompts, retries input lookup, clears prompt after success or terminal failure. Does not submit the prompt. |
| `initChatgptBridge(deps)`                   | Initializes bridge injection and storage-change listener. | proposal repository           | disposer-like function from listener is internal         | Reads current pending prompt and listens for new pending bridge prompts.                                                              |

Security/privacy notes:

- Prompt target host must match the current `window.location.hostname`.
- Prompt record is cleared by ID after success or terminal failure.
- The bridge writes into the page DOM but does not click submit.

## `src/app/repositories/browser-repositories.ts`

Purpose: composes browser storage clients, extension storage, and feature repositories for each runtime surface.

Types:

- `BrowserRepositories`
- `PlatformContentRepositories`
- `ChatGptBridgeRepositories`

Functions:

| Function                              | Purpose                                                                          | Inputs | Outputs                               | Side effects, errors, security                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------- | ------ | ------------------------------------- | ---------------------------------------------------------------------------------- |
| `createStorageComposition()`          | Creates local/session storage clients, AI secret storage, and extension storage. | none   | internal composition object           | Uses browser storage areas.                                                        |
| `composeBrowserStorage()`             | Creates full repository set for extension pages.                                 | none   | `BrowserStorageComposition`           | Exposes backup, monitoring, prompt, proposal, settings, and tracking repositories. |
| `createBrowserRepositories()`         | Public full repository factory.                                                  | none   | `BrowserRepositories`                 | Used by popup/dashboard entrypoints.                                               |
| `createPlatformContentRepositories()` | Narrow repository factory for platform content scripts.                          | none   | prompt/proposal/tracking repositories | Avoids exposing backup/settings repositories to platform pages.                    |
| `createChatGptBridgeRepositories()`   | Narrow repository factory for ChatGPT bridge.                                    | none   | proposal repository only              | Limits bridge content script to pending prompt operations.                         |

Related docs:

- [`../../09-content-scripts-and-platforms.md`](../../09-content-scripts-and-platforms.md)
- [`platforms-mostaql.md`](platforms-mostaql.md)
- [`platforms-khamsat.md`](platforms-khamsat.md)
- [`platforms-nafezly.md`](platforms-nafezly.md)
