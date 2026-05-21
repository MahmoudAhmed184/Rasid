import type { ProposalRepository } from '../../features/proposals/proposal-repository';

// ==========================================
// chatgpt-bridge/index.js — Prompt injection bridge
// ==========================================

interface ChatgptBridgeDependencies {
    readonly proposalRepository: Pick<
        ProposalRepository,
        'getPendingBridgePrompt' | 'onPendingBridgePromptChanged'
    >;
}

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

async function injectPrompt(deps: ChatgptBridgeDependencies): Promise<void> {
    const prompt = await deps.proposalRepository.getPendingBridgePrompt();

    if (!prompt) {
        return;
    } // No pending prompt

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
                    writePromptToEditable(inputField, prompt);
                } else if (inputField instanceof HTMLTextAreaElement) {
                    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype,
                        'value'
                    )?.set;

                    if (nativeTextAreaValueSetter) {
                        nativeTextAreaValueSetter.call(inputField, prompt);
                    } else {
                        inputField.value = prompt;
                    }
                }

                inputField.dispatchEvent(new Event('input', { bubbles: true }));
            }, 500);
        } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            console.error(
                'Mostaql Job Notifier: Could not find ChatGPT input field after multiple attempts.'
            );
        }
    }, 500);
}

// Listen for changes in storage (for when tab is reused/focused without reload)
export function initChatgptBridge(deps: ChatgptBridgeDependencies) {
    deps.proposalRepository.onPendingBridgePromptChanged(() => {
        setTimeout(() => {
            void injectPrompt(deps);
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
