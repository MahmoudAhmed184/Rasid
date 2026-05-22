import { describe, expect, it, vi } from 'vitest';

import type { PlatformAutofillDraft } from '../../../../src/entities/platform/model';
import { createProposalRepository } from '../../../../src/features/proposals/proposal-repository';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';
import { PENDING_BRIDGE_PROMPT_STORAGE_KEY } from '../../../../src/shared/storage/modules/proposal-state-storage';
import { createMemoryStorage } from '../../../support/fake-storage';
import { fakeBrowser } from '../../../support/fake-browser';

function createStorage() {
    let quickTemplate = 'default';

    return {
        getProposalTemplate: vi.fn(async () => quickTemplate),
        setProposalTemplate: vi.fn(async (template: string) => {
            quickTemplate = template;
            return quickTemplate;
        }),
    } satisfies Pick<ExtensionStorage, 'getProposalTemplate' | 'setProposalTemplate'>;
}

describe('proposal repository', () => {
    it('delegates quick template reads and writes', async () => {
        const storage = createStorage();
        const repository = createProposalRepository(
            storage as unknown as ExtensionStorage,
            createMemoryStorage()
        );

        await expect(repository.getQuickTemplate()).resolves.toBe('default');
        await expect(repository.setQuickTemplate('custom')).resolves.toBe('custom');
        expect(storage.setProposalTemplate).toHaveBeenCalledWith('custom');
    });

    it('stores one-shot bridge prompts and queued autofill drafts through proposal state storage', async () => {
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000022');
        const repository = createProposalRepository(
            createStorage() as unknown as ExtensionStorage,
            createMemoryStorage()
        );

        await repository.setPendingBridgePrompt('  Prompt body  ', 'https://chat.openai.com/c/1');
        const prompt = await repository.getPendingBridgePrompt();

        expect(prompt).toMatchObject({
            id: '00000000-0000-4000-8000-000000000022',
            prompt: 'Prompt body',
            targetHost: 'chat.openai.com',
        });
        await repository.clearPendingBridgePrompt('wrong-id');
        await expect(repository.getPendingBridgePrompt()).resolves.not.toBeNull();
        await repository.clearPendingBridgePrompt(prompt?.id);
        await expect(repository.getPendingBridgePrompt()).resolves.toBeNull();

        const draft: PlatformAutofillDraft = {
            platformId: 'nafezly',
            projectId: '99',
            proposal: 'proposal',
            amount: 500,
            durationDays: 7,
            createdAt: Date.now(),
        };

        await repository.queueAutofill(draft);
        await expect(repository.getQueuedAutofill('nafezly')).resolves.toEqual(draft);
        await repository.clearQueuedAutofill('nafezly');
        await expect(repository.getQueuedAutofill('nafezly')).resolves.toBeNull();
    });

    it('subscribes only to valid local pending bridge prompt changes and disposes the listener', () => {
        type StorageChangeListener = Parameters<
            typeof fakeBrowser.storage.onChanged.addListener
        >[0];
        type StorageChanges = Parameters<StorageChangeListener>[0];
        type StorageNamespace = Parameters<StorageChangeListener>[1];
        let capturedListener: StorageChangeListener | null = null;
        const addListener = vi
            .spyOn(fakeBrowser.storage.onChanged, 'addListener')
            .mockImplementation((listener: StorageChangeListener) => {
                capturedListener = listener;
            });
        const removeListener = vi
            .spyOn(fakeBrowser.storage.onChanged, 'removeListener')
            .mockImplementation(() => undefined);
        const listener = vi.fn();
        const repository = createProposalRepository(
            createStorage() as unknown as ExtensionStorage,
            createMemoryStorage()
        );

        const dispose = repository.onPendingBridgePromptChanged(listener);
        expect(addListener).toHaveBeenCalledOnce();
        if (!capturedListener) {
            throw new Error('Expected proposal storage listener to be registered.');
        }

        capturedListener(
            {
                [PENDING_BRIDGE_PROMPT_STORAGE_KEY]: {
                    newValue: {
                        id: 'p1',
                        prompt: 'Bridge prompt',
                        createdAt: Date.now(),
                        expiresAt: Date.now() + 10_000,
                        targetHost: 'chat.openai.com',
                    },
                },
            } as StorageChanges,
            'sync' as StorageNamespace
        );
        capturedListener(
            {
                [PENDING_BRIDGE_PROMPT_STORAGE_KEY]: {
                    newValue: {
                        id: 'p1',
                        prompt: 'Bridge prompt',
                        createdAt: Date.now(),
                        expiresAt: Date.now() + 10_000,
                        targetHost: 'chat.openai.com',
                    },
                },
            } as StorageChanges,
            'local' as StorageNamespace
        );

        expect(listener).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
        dispose();
        expect(removeListener).toHaveBeenCalledWith(capturedListener);
    });
});
