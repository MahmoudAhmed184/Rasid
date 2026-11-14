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
    readonly inFlightPromptIds: Set<string>;
    storageListenerRegistered: boolean;
    lastInjectedPrompt?: {
        readonly id: string;
        readonly prompt: string;
    };
    stabilityCleanup?: () => void;
}

declare global {
    interface Window {
        __rasidChatgptBridgeState__?: ChatgptBridgeRuntimeState;
    }
}

const CHAT_INPUT_WAIT_TIMEOUT_MS = 10_000;
const INITIAL_INJECTION_DELAY_MS = 1_000;
const STORAGE_CHANGE_INJECTION_DELAY_MS = 500;
const STABILITY_WINDOW_MS = 2_500;
const STABILITY_CHECK_INTERVAL_MS = 200;

function getBridgeRuntimeState(): ChatgptBridgeRuntimeState {
    if (window.__rasidChatgptBridgeState__) {
        return window.__rasidChatgptBridgeState__;
    }

    const state: ChatgptBridgeRuntimeState = {
        injectedPromptIds: new Set<string>(),
        inFlightPromptIds: new Set<string>(),
        storageListenerRegistered: false,
    };

    window.__rasidChatgptBridgeState__ = state;
    return state;
}

function isEditableChatInput(element: Element | null): boolean {
    if (!element || !(element instanceof HTMLElement)) {
        return false;
    }
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        return !element.disabled && !element.readOnly;
    }
    if (element.getAttribute('aria-disabled') === 'true') {
        return false;
    }
    return (
        element.isContentEditable ||
        element.getAttribute('contenteditable') === 'true' ||
        element.classList.contains('ProseMirror') ||
        element.getAttribute('role') === 'textbox'
    );
}

export function findChatInput(): HTMLTextAreaElement | HTMLElement | null {
    const promptTextarea = document.querySelector(
        '#prompt-textarea, div[contenteditable="true"]#prompt-textarea'
    );

    if (promptTextarea instanceof HTMLElement) {
        const innerEditable = promptTextarea.querySelector<HTMLElement>(
            'div.ProseMirror, [contenteditable="true"][role="textbox"], [contenteditable="true"]'
        );
        if (innerEditable && isEditableChatInput(innerEditable)) {
            return innerEditable;
        }

        if (isEditableChatInput(promptTextarea)) {
            return promptTextarea;
        }
    }

    for (const form of document.querySelectorAll('form')) {
        const sendButton = form.querySelector(
            'button[type="submit"], button[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="إرسال"]'
        );

        if (!sendButton) {
            continue;
        }

        const formInput = form.querySelector(
            '#prompt-textarea, div[contenteditable="true"]#prompt-textarea, textarea, div.ProseMirror, [contenteditable="true"][role="textbox"], [contenteditable="true"]'
        );

        if (formInput instanceof HTMLElement && isEditableChatInput(formInput)) {
            return formInput;
        }
    }

    const fallbackProseMirror = document.querySelector<HTMLElement>(
        'div[contenteditable="true"]#prompt-textarea, div.ProseMirror[contenteditable="true"], div.ProseMirror'
    );
    if (fallbackProseMirror instanceof HTMLElement && isEditableChatInput(fallbackProseMirror)) {
        return fallbackProseMirror;
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
        let pollTimer: ReturnType<typeof setInterval> | number | null = null;

        const finish = (input: HTMLTextAreaElement | HTMLElement | null) => {
            if (settled) {
                return;
            }

            settled = true;
            window.clearTimeout(timeoutId);
            if (pollTimer) {
                window.clearInterval(pollTimer);
            }
            observer?.disconnect();
            resolve(input);
        };
        const timeoutId = window.setTimeout(() => {
            finish(null);
        }, timeoutMs);

        pollTimer = window.setInterval(() => {
            const input = findChatInput();
            if (input) {
                finish(input);
            }
        }, 100);

        if (typeof MutationObserver === 'function' && document.documentElement) {
            observer = new MutationObserver(() => {
                const input = findChatInput();

                if (input) {
                    finish(input);
                }
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['contenteditable', 'class'],
            });
        }
    });
}

export function writePromptToEditable(inputField: HTMLElement, prompt: string): void {
    try {
        window.focus();
    } catch {
        // Ignore window focus error
    }

    try {
        inputField.focus();
    } catch {
        // Ignore focus errors
    }

    const selection = window.getSelection?.();
    if (selection && typeof document.createRange === 'function') {
        try {
            const range = document.createRange();
            range.selectNodeContents(inputField);
            selection.removeAllRanges();
            selection.addRange(range);
        } catch {
            // Ignore range selection errors
        }
    }

    let inserted = false;
    if (typeof document.execCommand === 'function') {
        try {
            inserted = document.execCommand('insertText', false, prompt);
        } catch {
            inserted = false;
        }
    }

    const InputEventConstructor =
        typeof window.InputEvent === 'function'
            ? window.InputEvent
            : typeof InputEvent === 'function'
              ? InputEvent
              : null;

    if (!inserted) {
        if (InputEventConstructor) {
            try {
                const beforeInputEvent = new InputEventConstructor('beforeinput', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: prompt,
                });
                inputField.dispatchEvent(beforeInputEvent);
            } catch {
                // Ignore fallback event error
            }
        }

        if (inputField.textContent !== prompt) {
            inputField.textContent = prompt;
        }
    }

    if (InputEventConstructor) {
        try {
            inputField.dispatchEvent(
                new InputEventConstructor('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: prompt,
                })
            );
        } catch {
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } else {
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
    }

    inputField.dispatchEvent(new Event('change', { bubbles: true }));
}

function applyPromptToInput(inputField: HTMLElement, prompt: string): void {
    try {
        inputField.focus();
    } catch {
        // Ignore focus errors
    }

    if (inputField instanceof HTMLTextAreaElement || inputField instanceof HTMLInputElement) {
        const prototype =
            inputField instanceof HTMLTextAreaElement
                ? (window.HTMLTextAreaElement?.prototype ?? HTMLTextAreaElement.prototype)
                : (window.HTMLInputElement?.prototype ?? HTMLInputElement.prototype);
        const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.bind(
            inputField
        );

        if (nativeValueSetter) {
            nativeValueSetter(prompt);
        } else {
            inputField.value = prompt;
        }

        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        writePromptToEditable(inputField, prompt);
    }
}

function isPromptInElement(element: HTMLElement, prompt: string): boolean {
    const text =
        element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
            ? element.value
            : (element.textContent ?? '');
    const trimmed = text.trim();
    const promptTrimmed = prompt.trim();
    if (!promptTrimmed) {
        return true;
    }
    return trimmed.length > 0 && (trimmed === promptTrimmed || trimmed.includes(promptTrimmed));
}

function startHydrationWatcher(
    state: ChatgptBridgeRuntimeState,
    record: PendingBridgePrompt,
    durationMs = STABILITY_WINDOW_MS,
    checkIntervalMs = STABILITY_CHECK_INTERVAL_MS
): void {
    state.stabilityCleanup?.();

    const promptText = record.prompt;
    const promptId = record.id;
    let settled = false;
    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
        if (settled) {
            return;
        }
        settled = true;
        if (timer) {
            clearInterval(timer);
        }
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        observer?.disconnect();
        if (state.lastInjectedPrompt?.id === promptId) {
            state.lastInjectedPrompt = undefined;
        }
    };

    state.stabilityCleanup = cleanup;
    state.lastInjectedPrompt = {
        id: promptId,
        prompt: promptText,
    };

    const verifyAndRestore = () => {
        if (settled) {
            return;
        }
        const currentInput = findChatInput();
        if (!currentInput) {
            return;
        }

        if (!isPromptInElement(currentInput, promptText)) {
            applyPromptToInput(currentInput, promptText);
        }
    };

    timer = setInterval(verifyAndRestore, checkIntervalMs);

    if (typeof MutationObserver === 'function' && document.documentElement) {
        observer = new MutationObserver(() => {
            verifyAndRestore();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['contenteditable', 'class'],
        });
    }

    timeoutId = setTimeout(cleanup, durationMs);
}

async function injectPrompt(
    deps: ChatgptBridgeDependencies,
    state: ChatgptBridgeRuntimeState,
    pendingPrompt?: PendingBridgePrompt
): Promise<void> {
    const record = pendingPrompt ?? (await deps.proposalRepository.getPendingBridgePrompt());

    if (
        !record ||
        state.injectedPromptIds.has(record.id) ||
        state.inFlightPromptIds.has(record.id)
    ) {
        return;
    }

    const currentHost = window.location.hostname.toLowerCase();

    if (!isAllowedAiChatHost(currentHost) || record.targetHost !== currentHost) {
        return;
    }

    state.inFlightPromptIds.add(record.id);

    try {
        const inputField = await waitForChatInput(CHAT_INPUT_WAIT_TIMEOUT_MS);

        if (!inputField) {
            void deps.proposalRepository.clearPendingBridgePrompt(record.id);
            console.error(
                'Mostaql Job Notifier: Could not find ChatGPT input field before timeout.'
            );
            return;
        }

        applyPromptToInput(inputField, record.prompt);

        state.injectedPromptIds.add(record.id);
        void deps.proposalRepository.clearPendingBridgePrompt(record.id);
        startHydrationWatcher(state, record);
    } finally {
        state.inFlightPromptIds.delete(record.id);
    }
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
