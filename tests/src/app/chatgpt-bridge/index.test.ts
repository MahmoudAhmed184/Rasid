import { afterEach, describe, expect, it, vi } from 'vitest';

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
    afterEach(() => {
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

    it('clears stale pending prompts when the ChatGPT input never appears', async () => {
        vi.useFakeTimers();
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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

        await vi.advanceTimersByTimeAsync(12_000);

        expect(proposalRepository.clearPendingBridgePrompt).toHaveBeenCalledWith(
            'bridge-missing-input'
        );
        expect(error).toHaveBeenCalledWith(
            'Mostaql Job Notifier: Could not find ChatGPT input field after multiple attempts.'
        );
    });
});
