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

const injectedPromptIds = new Set<string>();

function findChatInput(): HTMLTextAreaElement | HTMLElement | null {
    // Selectors for ChatGPT's input box (subject to change)
    const selectors = [
        '#prompt-textarea',
        '[contenteditable="true"]',
        'textarea[data-id="root"]',
        'textarea',
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLElement) {
            return el;
        }
    }
    return null;
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
    pendingPrompt?: PendingBridgePrompt
): Promise<void> {
    const record = pendingPrompt ?? (await deps.proposalRepository.getPendingBridgePrompt());

    if (!record || injectedPromptIds.has(record.id)) {
        return;
    }

    const currentHost = window.location.hostname.toLowerCase();

    if (!isAllowedAiChatHost(currentHost) || record.targetHost !== currentHost) {
        return;
    }

    // Try to find the input box. It might take a moment to load.
    // We'll retry a few times.
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds (500ms interval)

    const interval = setInterval(() => {
        attempts++;
        const inputField = findChatInput();

        if (inputField) {
            clearInterval(interval);

            // Focusing
            inputField.focus();

            // Small delay to ensure focus
            setTimeout(() => {
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
                injectedPromptIds.add(record.id);
                void deps.proposalRepository.clearPendingBridgePrompt(record.id);
            }, 500);
        } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            void deps.proposalRepository.clearPendingBridgePrompt(record.id);
            console.error(
                'Mostaql Job Notifier: Could not find ChatGPT input field after multiple attempts.'
            );
        }
    }, 500);
}

// Listen for changes in storage (for when tab is reused/focused without reload)
export function initChatgptBridge(deps: ChatgptBridgeDependencies) {
    deps.proposalRepository.onPendingBridgePromptChanged((record) => {
        setTimeout(() => {
            void injectPrompt(deps, record);
        }, 500);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            void injectPrompt(deps);
        });
        return;
    }

    setTimeout(() => {
        void injectPrompt(deps);
    }, 1000);
}
