import type { ProposalRepository } from '../../features/proposals/proposal-repository';
import { isAllowedAiChatHost } from '../../entities/ai/chat-url';
import type { PendingBridgePrompt } from '../../shared/storage/modules/proposal-state-storage';

// ==========================================
// chatgpt-bridge/index.js — Prompt injection bridge
// ==========================================

interface ChatgptBridgeDependencies {
    readonly proposalRepository: Pick<
        ProposalRepository,
        'clearPendingBridgePrompt' | 'getPendingBridgePrompt' | 'onPendingBridgePromptChanged'
    >;
}

interface ChatgptBridgeRuntimeState {
    readonly injectedPromptIds: Set<string>;
    storageListenerRegistered: boolean;
}

declare global {
    interface Window {
        __rasidChatgptBridgeState__?: ChatgptBridgeRuntimeState;
    }
}

const CHAT_INPUT_WAIT_TIMEOUT_MS = 10_000;
const INITIAL_INJECTION_DELAY_MS = 1_000;
const STORAGE_CHANGE_INJECTION_DELAY_MS = 500;

function getBridgeRuntimeState(): ChatgptBridgeRuntimeState {
    if (window.__rasidChatgptBridgeState__) {
        return window.__rasidChatgptBridgeState__;
    }

    const state: ChatgptBridgeRuntimeState = {
        injectedPromptIds: new Set<string>(),
        storageListenerRegistered: false,
    };

    window.__rasidChatgptBridgeState__ = state;
    return state;
}

function findChatInput(): HTMLTextAreaElement | HTMLElement | null {
    const promptTextarea = document.querySelector('#prompt-textarea');

    if (promptTextarea instanceof HTMLTextAreaElement || promptTextarea instanceof HTMLElement) {
        return promptTextarea;
    }

    for (const form of document.querySelectorAll('form')) {
        const sendButton = form.querySelector(
            'button[type="submit"], button[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="إرسال"]'
        );

        if (!sendButton) {
            continue;
        }

        const formInput = form.querySelector('textarea, [contenteditable="true"][role="textbox"]');

        if (formInput instanceof HTMLTextAreaElement || formInput instanceof HTMLElement) {
            return formInput;
        }
    }

    return null;
}

function waitForChatInput(timeoutMs: number): Promise<HTMLTextAreaElement | HTMLElement | null> {
    const existingInput = findChatInput();

    if (existingInput) {
        return Promise.resolve(existingInput);
    }

    return new Promise((resolve) => {
        let settled = false;
        let observer: MutationObserver | null = null;
        const finish = (input: HTMLTextAreaElement | HTMLElement | null) => {
            if (settled) {
                return;
            }

            settled = true;
            window.clearTimeout(timeoutId);
            observer?.disconnect();
            resolve(input);
        };
        const timeoutId = window.setTimeout(() => {
            finish(null);
        }, timeoutMs);

        if (typeof MutationObserver === 'function') {
            observer = new MutationObserver(() => {
                const input = findChatInput();

                if (input) {
                    finish(input);
                }
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
            });
        }
    });
}

function writePromptToEditable(inputField: HTMLElement, prompt: string): void {
    const paragraph = document.createElement('p');
    const lines = prompt.split('\n');

    lines.forEach((line, index) => {
        if (index > 0) {
            paragraph.appendChild(document.createElement('br'));
        }

        paragraph.append(line);
    });

    inputField.replaceChildren(paragraph);
}

async function injectPrompt(
    deps: ChatgptBridgeDependencies,
    state: ChatgptBridgeRuntimeState,
    pendingPrompt?: PendingBridgePrompt
): Promise<void> {
    const record = pendingPrompt ?? (await deps.proposalRepository.getPendingBridgePrompt());

    if (!record || state.injectedPromptIds.has(record.id)) {
        return;
    }

    const currentHost = window.location.hostname.toLowerCase();

    if (!isAllowedAiChatHost(currentHost) || record.targetHost !== currentHost) {
        return;
    }

    const inputField = await waitForChatInput(CHAT_INPUT_WAIT_TIMEOUT_MS);

    if (!inputField) {
        void deps.proposalRepository.clearPendingBridgePrompt(record.id);
        console.error('Mostaql Job Notifier: Could not find ChatGPT input field before timeout.');
        return;
    }

    inputField.focus();

    if (inputField.isContentEditable) {
        writePromptToEditable(inputField, record.prompt);
    } else if (inputField instanceof HTMLTextAreaElement) {
        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
        )?.set?.bind(inputField);

        if (nativeTextAreaValueSetter) {
            nativeTextAreaValueSetter(record.prompt);
        } else {
            inputField.value = record.prompt;
        }
    }

    inputField.dispatchEvent(new Event('input', { bubbles: true }));
    state.injectedPromptIds.add(record.id);
    void deps.proposalRepository.clearPendingBridgePrompt(record.id);
}

// Listen for changes in storage (for when tab is reused/focused without reload)
export function initChatgptBridge(deps: ChatgptBridgeDependencies) {
    const state = getBridgeRuntimeState();

    if (!state.storageListenerRegistered) {
        deps.proposalRepository.onPendingBridgePromptChanged((record) => {
            setTimeout(() => {
                void injectPrompt(deps, state, record);
            }, STORAGE_CHANGE_INJECTION_DELAY_MS);
        });
        state.storageListenerRegistered = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            void injectPrompt(deps, state);
        });
        return;
    }

    setTimeout(() => {
        void injectPrompt(deps, state);
    }, INITIAL_INJECTION_DELAY_MS);
}
