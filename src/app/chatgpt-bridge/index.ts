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

const CHAT_INPUT_WAIT_TIMEOUT_MS = 25_000;
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

function isElementMounted(element: Element | null): boolean {
    if (!element || !(element instanceof HTMLElement)) {
        return false;
    }
    return element.isConnected ?? (document.contains ? document.contains(element) : true);
}

export function isElementVisible(element: Element | null): boolean {
    if (!element || !(element instanceof HTMLElement)) {
        return false;
    }
    if (!isElementMounted(element)) {
        return false;
    }
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
        return false;
    }
    if (element.style?.display === 'none' || element.style?.visibility === 'hidden') {
        return false;
    }
    let current: HTMLElement | null = element.parentElement;
    while (current) {
        if (current.hidden || current.getAttribute('aria-hidden') === 'true') {
            return false;
        }
        if (current.style?.display === 'none' || current.style?.visibility === 'hidden') {
            return false;
        }
        current = current.parentElement;
    }
    if (typeof element.checkVisibility === 'function') {
        try {
            if (!element.checkVisibility()) {
                return false;
            }
        } catch {
            // Ignore checkVisibility errors in mock environments
        }
    }
    if (typeof window.getComputedStyle === 'function') {
        try {
            const style = window.getComputedStyle(element);
            if (style && (style.display === 'none' || style.visibility === 'hidden')) {
                return false;
            }
        } catch {
            // Ignore getComputedStyle errors
        }
    }
    return true;
}

export function isEditableChatInput(element: Element | null): boolean {
    if (!element || !(element instanceof HTMLElement)) {
        return false;
    }
    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
        return false;
    }
    if (typeof element.closest === 'function') {
        if (element.closest('fieldset[disabled], [aria-disabled="true"]')) {
            return false;
        }
    }
    if (element.getAttribute('contenteditable') === 'false') {
        return false;
    }
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        return !element.disabled && !element.readOnly;
    }
    return Boolean(
        element.isContentEditable ||
        element.getAttribute('contenteditable') === 'true' ||
        element.classList.contains('ProseMirror') ||
        element.getAttribute('role') === 'textbox'
    );
}

function isReadyChatInput(element: Element | null): element is HTMLTextAreaElement | HTMLElement {
    return isEditableChatInput(element) && isElementVisible(element);
}

export function findChatInput(): HTMLTextAreaElement | HTMLElement | null {
    const promptTextarea = document.querySelector(
        '#prompt-textarea, div[contenteditable="true"]#prompt-textarea'
    );

    if (promptTextarea instanceof HTMLElement) {
        const innerEditable = promptTextarea.querySelector<HTMLElement>(
            'div.ProseMirror, [contenteditable="true"][role="textbox"], [contenteditable="true"]'
        );
        if (innerEditable && isReadyChatInput(innerEditable)) {
            return innerEditable;
        }

        if (isReadyChatInput(promptTextarea)) {
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

        if (formInput instanceof HTMLElement && isReadyChatInput(formInput)) {
            return formInput;
        }
    }

    const fallbackProseMirror = document.querySelector<HTMLElement>(
        'div[contenteditable="true"]#prompt-textarea, div.ProseMirror[contenteditable="true"], div.ProseMirror'
    );
    if (fallbackProseMirror instanceof HTMLElement && isReadyChatInput(fallbackProseMirror)) {
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

        const targetNode = document.documentElement || document.body;
        if (typeof MutationObserver === 'function' && targetNode) {
            observer = new MutationObserver(() => {
                const input = findChatInput();

                if (input) {
                    finish(input);
                }
            });

            observer.observe(targetNode, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'contenteditable',
                    'class',
                    'disabled',
                    'aria-disabled',
                    'hidden',
                    'style',
                    'aria-hidden',
                    'readonly',
                ],
            });
        }
    });
}

function getEditorText(element: HTMLElement): string {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        return element.value;
    }
    return element.innerText || element.textContent || '';
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

    let inserted = false;
    try {
        const selection = window.getSelection?.();
        if (selection && typeof document.createRange === 'function') {
            const range = document.createRange();
            range.selectNodeContents(inputField);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        if (typeof document.execCommand === 'function') {
            inserted = document.execCommand('insertText', false, prompt);
        }
    } catch {
        inserted = false;
    }

    const currentText = getEditorText(inputField);
    if (!inserted || !currentText.trim()) {
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

    try {
        const selection = window.getSelection?.();
        if (selection && typeof document.createRange === 'function') {
            const range = document.createRange();
            range.selectNodeContents(inputField);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    } catch {
        // Ignore selection error
    }

    const InputEventConstructor =
        typeof window.InputEvent === 'function'
            ? window.InputEvent
            : typeof InputEvent === 'function'
              ? InputEvent
              : null;

    if (InputEventConstructor) {
        try {
            inputField.dispatchEvent(
                new InputEventConstructor('beforeinput', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: prompt,
                })
            );
        } catch {
            // Ignore fallback event error
        }

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
    inputField.dispatchEvent(new Event('keyup', { bubbles: true }));
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
    const text = getEditorText(element);
    const trimmed = text.trim();
    const promptTrimmed = prompt.trim();
    if (!promptTrimmed) {
        return true;
    }
    if (trimmed.length === 0) {
        return false;
    }
    const normalizedText = trimmed.replace(/\s+/g, ' ');
    const normalizedPrompt = promptTrimmed.replace(/\s+/g, ' ');
    const promptPrefix = normalizedPrompt.slice(0, 30);
    return normalizedText.includes(promptPrefix);
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
    let timer: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isRestoring = false;

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
        if (settled || isRestoring) {
            return;
        }
        const currentInput = findChatInput();
        if (!currentInput) {
            return;
        }

        if (!isPromptInElement(currentInput, promptText)) {
            isRestoring = true;
            try {
                applyPromptToInput(currentInput, promptText);
            } finally {
                isRestoring = false;
            }
        }
    };

    timer = setInterval(verifyAndRestore, checkIntervalMs);
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
            console.warn(
                'Mostaql Job Notifier: Could not find ChatGPT input field before timeout; preserving pending prompt for retry.'
            );
            return;
        }

        applyPromptToInput(inputField, record.prompt);

        if (!isPromptInElement(inputField, record.prompt)) {
            console.warn(
                'Mostaql Job Notifier: Prompt injection did not take effect; preserving pending prompt for retry.'
            );
            return;
        }

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
            const delay = findChatInput() ? 0 : STORAGE_CHANGE_INJECTION_DELAY_MS;
            setTimeout(() => {
                void injectPrompt(deps, state, record);
            }, delay);
        });
        state.storageListenerRegistered = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            void injectPrompt(deps, state);
        });
        return;
    }

    const initialDelay = findChatInput() ? 0 : INITIAL_INJECTION_DELAY_MS;
    setTimeout(() => {
        void injectPrompt(deps, state);
    }, initialDelay);
}
