import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initChatgptBridge } from '../../../../src/app/chatgpt-bridge';
import type { PendingBridgePrompt } from '../../../../src/shared/storage/modules/proposal-state-storage';
import { installTestDom } from '../../../support/html';

function setWindowHost(hostname: string): void {
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { hostname },
    });
}

function createDeps(record: PendingBridgePrompt | null) {
    let changeHandler: ((next: PendingBridgePrompt) => void) | null = null;

    return {
        deps: {
            getPendingBridgePrompt: vi.fn(async () => record),
            clearPendingBridgePrompt: vi.fn(async () => undefined),
            onPendingBridgePromptChanged: vi.fn((handler: (next: PendingBridgePrompt) => void) => {
                changeHandler = handler;
                return () => undefined;
            }),
        },
        emit(next: PendingBridgePrompt) {
            changeHandler?.(next);
        },
    };
}

describe('ChatGPT bridge', () => {
    beforeEach(() => {
        delete window.__rasidChatgptBridgeState__;
    });

    afterEach(() => {
        window.__rasidChatgptBridgeState__?.stabilityCleanup?.();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('injects pending prompts into matching ChatGPT textareas and clears them once', async () => {
        vi.useFakeTimers();
        installTestDom('<!doctype html><textarea id="prompt-textarea"></textarea>');
        setWindowHost('chatgpt.com');
        const record: PendingBridgePrompt = {
            id: 'bridge-1',
            prompt: 'Draft proposal\nSecond line',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        await vi.advanceTimersByTimeAsync(2_000);

        expect((document.getElementById('prompt-textarea') as HTMLTextAreaElement).value).toBe(
            'Draft proposal\nSecond line'
        );
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith('bridge-1');
    });

    it('does not inject prompts for a different target host', async () => {
        vi.useFakeTimers();
        installTestDom('<!doctype html><textarea id="prompt-textarea"></textarea>');
        setWindowHost('chat.openai.com');
        const record: PendingBridgePrompt = {
            id: 'bridge-2',
            prompt: 'Should stay pending',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        await vi.advanceTimersByTimeAsync(2_000);

        expect((document.getElementById('prompt-textarea') as HTMLTextAreaElement).value).toBe('');
        expect(proposalRepository.clearPendingBridgePrompt).not.toHaveBeenCalled();
    });

    it('injects storage-change prompts into contenteditable inputs only once per prompt id', async () => {
        vi.useFakeTimers();
        installTestDom('<!doctype html><div id="prompt-textarea" contenteditable="true"></div>');
        Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
            configurable: true,
            get(this: HTMLElement) {
                return this.getAttribute('contenteditable') === 'true';
            },
        });
        setWindowHost('chat.openai.com');
        const initialRecord: PendingBridgePrompt = {
            id: 'bridge-initial',
            prompt: 'Initial prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const changedRecord: PendingBridgePrompt = {
            id: 'bridge-contenteditable',
            prompt: 'Line one\nLine two',
            createdAt: 2,
            expiresAt: 302_000,
            targetHost: 'chat.openai.com',
        };
        const { deps: proposalRepository, emit } = createDeps(initialRecord);

        initChatgptBridge({ proposalRepository });
        emit(changedRecord);

        await vi.advanceTimersByTimeAsync(1_500);

        const editor = document.getElementById('prompt-textarea');
        expect(editor?.textContent).toBe('Line oneLine two');
        expect(editor?.querySelectorAll('br')).toHaveLength(1);
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-contenteditable'
        );

        emit(changedRecord);
        await vi.advanceTimersByTimeAsync(1_500);

        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledTimes(1);
    });

    it('injects prompt into contenteditable ProseMirror using execCommand and dispatches input event', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><div id="prompt-textarea" contenteditable="true" class="ProseMirror"></div>'
        );
        setWindowHost('chatgpt.com');

        const editor = document.getElementById('prompt-textarea')!;
        const inputSpy = vi.fn();
        editor.addEventListener('input', inputSpy);

        const execCommandSpy = vi.fn((_cmd: string, _ui: boolean, value?: string) => {
            editor.textContent = value ?? '';
            return true;
        });
        document.execCommand = execCommandSpy as unknown as typeof document.execCommand;

        const record: PendingBridgePrompt = {
            id: 'bridge-prosemirror-exec',
            prompt: 'ProseMirror prompt\nLine 2',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(execCommandSpy).toHaveBeenCalledWith(
            'insertText',
            false,
            'ProseMirror prompt\nLine 2'
        );
        expect(inputSpy).toHaveBeenCalled();
        expect(editor.textContent).toBe('ProseMirror prompt\nLine 2');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-prosemirror-exec'
        );
    });

    it('falls back to InputEvent beforeinput when execCommand returns false', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><div id="prompt-textarea" contenteditable="true" class="ProseMirror"></div>'
        );
        setWindowHost('chatgpt.com');

        const editor = document.getElementById('prompt-textarea')!;
        const beforeInputSpy = vi.fn();
        const inputSpy = vi.fn();
        editor.addEventListener('beforeinput', (event) => {
            const inputEv = event as InputEvent;
            beforeInputSpy({
                inputType: inputEv.inputType,
                data: inputEv.data,
            });
        });
        editor.addEventListener('input', inputSpy);

        document.execCommand = vi
            .fn()
            .mockReturnValue(false) as unknown as typeof document.execCommand;

        const record: PendingBridgePrompt = {
            id: 'bridge-prosemirror-fallback',
            prompt: 'Fallback beforeinput prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(beforeInputSpy).toHaveBeenCalledWith({
            inputType: 'insertText',
            data: 'Fallback beforeinput prompt',
        });
        expect(inputSpy).toHaveBeenCalled();
        expect(editor.textContent).toBe('Fallback beforeinput prompt');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-prosemirror-fallback'
        );
    });

    it('dispatches both input and change events when injecting into contenteditable', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><div id="prompt-textarea" contenteditable="true" class="ProseMirror"></div>'
        );
        setWindowHost('chatgpt.com');

        const editor = document.getElementById('prompt-textarea')!;
        const inputSpy = vi.fn();
        const changeSpy = vi.fn();
        editor.addEventListener('input', inputSpy);
        editor.addEventListener('change', changeSpy);

        const record: PendingBridgePrompt = {
            id: 'bridge-events-check',
            prompt: 'Event test prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(inputSpy).toHaveBeenCalled();
        expect(changeSpy).toHaveBeenCalled();
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-events-check'
        );
    });

    it('detects and injects into fallback standalone div.ProseMirror elements', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><main><div class="ProseMirror" contenteditable="true"></div></main>'
        );
        setWindowHost('chatgpt.com');

        const editor = document.querySelector('div.ProseMirror') as HTMLElement;
        const record: PendingBridgePrompt = {
            id: 'bridge-prosemirror-selector',
            prompt: 'ProseMirror selector prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(editor.textContent).toBe('ProseMirror selector prompt');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-prosemirror-selector'
        );
    });

    it('detects nested ProseMirror inside wrapper div#prompt-textarea', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><div id="prompt-textarea"><div class="ProseMirror" contenteditable="true"></div></div>'
        );
        setWindowHost('chatgpt.com');

        const innerEditor = document.querySelector('div.ProseMirror') as HTMLElement;
        const record: PendingBridgePrompt = {
            id: 'bridge-nested-prosemirror',
            prompt: 'Nested ProseMirror prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(innerEditor.textContent).toBe('Nested ProseMirror prompt');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-nested-prosemirror'
        );
    });

    it('bypasses an uneditable #prompt-textarea placeholder and detects sibling ProseMirror', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><div id="prompt-textarea" class="skeleton-wrapper"></div><div class="ProseMirror" contenteditable="true"></div>'
        );
        setWindowHost('chatgpt.com');

        const editor = document.querySelector('div.ProseMirror') as HTMLElement;
        const record: PendingBridgePrompt = {
            id: 'bridge-sibling-prosemirror',
            prompt: 'Sibling ProseMirror prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(editor.textContent).toBe('Sibling ProseMirror prompt');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-sibling-prosemirror'
        );
    });

    it('detects input when contenteditable attribute is added dynamically after initial render', async () => {
        vi.useFakeTimers();
        installTestDom('<!doctype html><div id="prompt-textarea"></div>');
        setWindowHost('chatgpt.com');

        const placeholder = document.getElementById('prompt-textarea')!;
        const record: PendingBridgePrompt = {
            id: 'bridge-dynamic-attribute',
            prompt: 'Hydrated prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        // Advance 1000ms: prompt injection starts waiting for chat input
        await vi.advanceTimersByTimeAsync(1_000);

        // Dynamically simulate React hydration adding contenteditable="true"
        placeholder.setAttribute('contenteditable', 'true');

        // Allow MutationObserver/polling to detect the attribute change
        await vi.advanceTimersByTimeAsync(200);

        expect(placeholder.textContent).toBe('Hydrated prompt');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-dynamic-attribute'
        );
    });

    it('prevents concurrent in-flight injection race conditions for the same prompt', async () => {
        vi.useFakeTimers();
        installTestDom('<!doctype html><textarea id="prompt-textarea"></textarea>');
        setWindowHost('chatgpt.com');

        const record: PendingBridgePrompt = {
            id: 'bridge-inflight-lock',
            prompt: 'In-flight prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository, emit } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        // Trigger storage change listener before initial timeout finishes
        emit(record);

        await vi.advanceTimersByTimeAsync(2_000);

        const textarea = document.getElementById('prompt-textarea') as HTMLTextAreaElement;
        expect(textarea.value).toBe('In-flight prompt');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledTimes(1);
    });

    it('does not register duplicate storage listeners when injected repeatedly', async () => {
        vi.useFakeTimers();
        installTestDom('<!doctype html><textarea id="prompt-textarea"></textarea>');
        setWindowHost('chatgpt.com');
        const record: PendingBridgePrompt = {
            id: 'bridge-repeat',
            prompt: 'Draft once',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository, emit } = createDeps(record);

        initChatgptBridge({ proposalRepository });
        initChatgptBridge({ proposalRepository });

        expect(proposalRepository.onPendingBridgePromptChanged).toHaveBeenCalledOnce();

        emit(record);
        await vi.advanceTimersByTimeAsync(2_000);

        expect((document.getElementById('prompt-textarea') as HTMLTextAreaElement).value).toBe(
            'Draft once'
        );
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledTimes(1);
    });

    it('uses composer-scoped inputs instead of unrelated global textareas', async () => {
        vi.useFakeTimers();
        installTestDom(`
            <!doctype html>
            <textarea id="unrelated"></textarea>
            <form>
                <textarea id="composer-input"></textarea>
                <button type="submit">Send</button>
            </form>
        `);
        setWindowHost('chatgpt.com');
        const record: PendingBridgePrompt = {
            id: 'bridge-scoped',
            prompt: 'Scoped prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        await vi.advanceTimersByTimeAsync(2_000);

        expect((document.getElementById('unrelated') as HTMLTextAreaElement).value).toBe('');
        expect((document.getElementById('composer-input') as HTMLTextAreaElement).value).toBe(
            'Scoped prompt'
        );
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith('bridge-scoped');
    });

    it('preserves pending prompt when the ChatGPT input does not appear before timeout', async () => {
        vi.useFakeTimers();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        installTestDom('<!doctype html><main></main>');
        setWindowHost('chatgpt.com');
        const record: PendingBridgePrompt = {
            id: 'bridge-missing-input',
            prompt: 'Draft proposal',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        await vi.advanceTimersByTimeAsync(26_000);

        expect(proposalRepository.clearPendingBridgePrompt).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('preserving pending prompt'));
    });

    it('waits for hidden or display:none input to become visible before injecting', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><textarea id="prompt-textarea" style="display: none;"></textarea>'
        );
        setWindowHost('chatgpt.com');

        const textarea = document.getElementById('prompt-textarea') as HTMLTextAreaElement;
        const record: PendingBridgePrompt = {
            id: 'bridge-hidden-visibility',
            prompt: 'Visible after hydration',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        // Advance initial delay
        await vi.advanceTimersByTimeAsync(1_500);

        // While display is none, input must not be injected
        expect(textarea.value).toBe('');
        expect(proposalRepository.clearPendingBridgePrompt).not.toHaveBeenCalled();

        // Simulate hydration revealing the textarea
        textarea.style.display = 'block';

        // Advance to allow MutationObserver / polling to detect visibility
        await vi.advanceTimersByTimeAsync(200);

        expect(textarea.value).toBe('Visible after hydration');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-hidden-visibility'
        );
    });

    it('waits for contenteditable=false to become editable before injecting', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><div id="prompt-textarea" contenteditable="false" class="ProseMirror"></div>'
        );
        setWindowHost('chatgpt.com');

        const editor = document.getElementById('prompt-textarea')!;
        const record: PendingBridgePrompt = {
            id: 'bridge-initially-uneditable',
            prompt: 'Editable after hydration',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        // Advance initial delay
        await vi.advanceTimersByTimeAsync(1_500);

        // While contenteditable="false", input must not be injected
        expect(editor.textContent).toBe('');
        expect(proposalRepository.clearPendingBridgePrompt).not.toHaveBeenCalled();

        // Simulate hydration enabling the editor
        editor.setAttribute('contenteditable', 'true');

        await vi.advanceTimersByTimeAsync(200);

        expect(editor.textContent).toBe('Editable after hydration');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-initially-uneditable'
        );
    });

    it('successfully injects within the extended retry window when input mounts late', async () => {
        vi.useFakeTimers();
        installTestDom('<!doctype html><main id="chat-root"></main>');
        setWindowHost('chatgpt.com');

        const record: PendingBridgePrompt = {
            id: 'bridge-late-mount',
            prompt: 'Late mounted prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        // Advance 15 seconds (well beyond old 10s timeout, but within extended 25s window)
        await vi.advanceTimersByTimeAsync(15_000);

        expect(proposalRepository.clearPendingBridgePrompt).not.toHaveBeenCalled();

        // SPA mounts the input at 15s
        const main = document.getElementById('chat-root')!;
        const textarea = document.createElement('textarea');
        textarea.id = 'prompt-textarea';
        main.appendChild(textarea);

        // Advance 200ms for observer/polling
        await vi.advanceTimersByTimeAsync(200);

        expect(textarea.value).toBe('Late mounted prompt');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-late-mount'
        );
    });

    it('restores prompt if React hydration clears the editor shortly after injection', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><div id="prompt-textarea" contenteditable="true" class="ProseMirror"></div>'
        );
        setWindowHost('chatgpt.com');

        const editor = document.getElementById('prompt-textarea')!;
        const record: PendingBridgePrompt = {
            id: 'bridge-react-hydration-wipe',
            prompt: 'Cold load hydrated prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        // Advance 1200ms: initial injection occurs and sets textContent
        await vi.advanceTimersByTimeAsync(1_200);
        expect(editor.textContent).toBe('Cold load hydrated prompt');

        // Simulate React mounting and wiping editor state during hydration
        editor.textContent = '';
        expect(editor.textContent).toBe('');

        // Advance stability check interval (200ms)
        await vi.advanceTimersByTimeAsync(300);

        // Bridge stability watcher must detect the wipe and restore prompt
        expect(editor.textContent).toBe('Cold load hydrated prompt');
    });

    it('restores prompt if React hydration replaces the editor element with a new empty one', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><main><div id="prompt-textarea" contenteditable="true"></div></main>'
        );
        setWindowHost('chatgpt.com');

        const record: PendingBridgePrompt = {
            id: 'bridge-react-element-replace',
            prompt: 'Replaced element prompt',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });
        await vi.advanceTimersByTimeAsync(1_200);

        // Initial element received prompt
        const initialEditor = document.getElementById('prompt-textarea')!;
        expect(initialEditor.textContent).toBe('Replaced element prompt');

        // Simulate React replacing the container with a brand new empty editor element
        const main = document.querySelector('main')!;
        main.innerHTML =
            '<div id="prompt-textarea" contenteditable="true" class="ProseMirror"></div>';

        // Advance stability check interval (200ms)
        await vi.advanceTimersByTimeAsync(300);

        const newEditor = document.getElementById('prompt-textarea')!;
        expect(newEditor.textContent).toBe('Replaced element prompt');
    });

    it('prioritizes inner ProseMirror editor when outer container has contenteditable', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><div id="prompt-textarea" contenteditable="true"><div class="ProseMirror" contenteditable="true"></div></div>'
        );
        setWindowHost('chatgpt.com');

        const outer = document.getElementById('prompt-textarea')!;
        const inner = outer.querySelector('div.ProseMirror') as HTMLElement;

        const record: PendingBridgePrompt = {
            id: 'bridge-nested-editable-priority',
            prompt: 'Target inner ProseMirror',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(inner.textContent).toBe('Target inner ProseMirror');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-nested-editable-priority'
        );
    });

    it('waits for hidden ancestor container to become visible before injecting', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><div id="parent-box" style="display: none;"><textarea id="prompt-textarea"></textarea></div>'
        );
        setWindowHost('chatgpt.com');

        const parentBox = document.getElementById('parent-box')!;
        const textarea = document.getElementById('prompt-textarea') as HTMLTextAreaElement;
        const record: PendingBridgePrompt = {
            id: 'bridge-ancestor-hidden',
            prompt: 'Visible after parent unhides',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        // Advance 1.5s
        await vi.advanceTimersByTimeAsync(1_500);
        expect(textarea.value).toBe('');
        expect(proposalRepository.clearPendingBridgePrompt).not.toHaveBeenCalled();

        // Reveal parent container
        parentBox.style.display = 'block';
        await vi.advanceTimersByTimeAsync(200);

        expect(textarea.value).toBe('Visible after parent unhides');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-ancestor-hidden'
        );
    });

    it('waits for disabled ancestor fieldset to become enabled before injecting', async () => {
        vi.useFakeTimers();
        installTestDom(
            '<!doctype html><fieldset disabled id="composer-fieldset"><textarea id="prompt-textarea"></textarea></fieldset>'
        );
        setWindowHost('chatgpt.com');

        const fieldset = document.getElementById('composer-fieldset') as HTMLFieldSetElement;
        const textarea = document.getElementById('prompt-textarea') as HTMLTextAreaElement;
        const record: PendingBridgePrompt = {
            id: 'bridge-fieldset-disabled',
            prompt: 'Enabled after fieldset ready',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        await vi.advanceTimersByTimeAsync(1_500);
        expect(textarea.value).toBe('');
        expect(proposalRepository.clearPendingBridgePrompt).not.toHaveBeenCalled();

        // Enable fieldset
        fieldset.removeAttribute('disabled');
        await vi.advanceTimersByTimeAsync(200);

        expect(textarea.value).toBe('Enabled after fieldset ready');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-fieldset-disabled'
        );
    });

    it('injects immediately on warm tab when input is already present without waiting for initial delay', async () => {
        vi.useFakeTimers();
        installTestDom('<!doctype html><textarea id="prompt-textarea"></textarea>');
        setWindowHost('chatgpt.com');

        const textarea = document.getElementById('prompt-textarea') as HTMLTextAreaElement;
        const record: PendingBridgePrompt = {
            id: 'bridge-warm-tab',
            prompt: 'Immediate warm injection',
            createdAt: 1,
            expiresAt: 301_000,
            targetHost: 'chatgpt.com',
        };
        const { deps: proposalRepository, emit } = createDeps(record);

        initChatgptBridge({ proposalRepository });

        // Should inject at next tick (0ms) rather than waiting 1000ms
        await vi.advanceTimersByTimeAsync(10);
        expect(textarea.value).toBe('Immediate warm injection');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith('bridge-warm-tab');

        // Storage change on warm tab also injects immediately
        const secondRecord: PendingBridgePrompt = {
            id: 'bridge-warm-second',
            prompt: 'Second warm injection',
            createdAt: 2,
            expiresAt: 302_000,
            targetHost: 'chatgpt.com',
        };
        emit(secondRecord);

        await vi.advanceTimersByTimeAsync(10);
        expect(textarea.value).toBe('Second warm injection');
        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-warm-second'
        );
    });
});
