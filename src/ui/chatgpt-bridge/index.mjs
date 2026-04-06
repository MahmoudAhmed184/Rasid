import { browser } from 'wxt/browser';

// ==========================================
// chatgpt-bridge/index.js — Prompt injection bridge
// ==========================================

const browserApi = browser;

function findChatInput() {
    // Selectors for ChatGPT's input box (subject to change)
    const selectors = [
        '#prompt-textarea',
        '[contenteditable="true"]',
        'textarea[data-id="root"]',
        'textarea',
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            return el;
        }
    }
    return null;
}

async function injectPrompt() {
    const data = await browserApi.storage.local.get(['pendingChatGptPrompt']);
    const prompt = data.pendingChatGptPrompt;

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
                    inputField.innerHTML = `<p>${prompt.replace(/\n/g, '<br>')}</p>`;
                } else {
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
export function initChatgptBridge() {
    browserApi.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.pendingChatGptPrompt?.newValue) {
            setTimeout(() => {
                void injectPrompt();
            }, 500);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            void injectPrompt();
        });
        return;
    }

    setTimeout(() => {
        void injectPrompt();
    }, 1000);
}
