import { describe, expect, it, vi } from 'vitest';

import {
    PENDING_BRIDGE_PROMPT_STORAGE_KEY,
    PROPOSAL_STATE_KEYS,
    createPendingBridgePromptRecord,
    createProposalStateStorage,
    normalizePendingBridgePromptRecord,
    normalizeQueuedAutofill,
    normalizeProposalStateBackupPatch,
} from '../../../../src/shared/storage/modules/proposal-state-storage';
import type { PlatformId } from '../../../../src/entities/platform/model';
import { createMemoryStorage } from '../../../support/fake-storage';

type Mutable<T> = {
    -readonly [Key in keyof T]: T[Key];
};

describe('proposal state storage', () => {
    it('creates bounded pending ChatGPT bridge prompts with target hosts and TTL', () => {
        vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
        const record = createPendingBridgePromptRecord('  hello  ', {
            chatUrl: 'https://chat.openai.com/c/123',
            now: 1_000,
        });

        expect(record).toEqual({
            id: '00000000-0000-4000-8000-000000000000',
            prompt: 'hello',
            createdAt: 1_000,
            expiresAt: 301_000,
            targetHost: 'chat.openai.com',
        });
    });

    it('rejects expired, empty, malformed, and over-trusting pending bridge records', () => {
        const longPrompt = 'x'.repeat(20_010);

        expect(
            normalizePendingBridgePromptRecord(
                {
                    id: ' prompt-id ',
                    prompt: ` ${longPrompt} `,
                    createdAt: 1,
                    expiresAt: 10_000,
                    targetHost: 'CHAT.OPENAI.COM ',
                },
                11
            )
        ).toMatchObject({
            id: 'prompt-id',
            prompt: 'x'.repeat(20_000),
            targetHost: 'chat.openai.com',
        });
        expect(
            normalizePendingBridgePromptRecord(
                {
                    id: 'a',
                    prompt: 'hello',
                    createdAt: 1,
                    expiresAt: 10,
                    targetHost: 'chatgpt.com',
                },
                11
            )
        ).toBeNull();
        expect(
            normalizePendingBridgePromptRecord({ id: 'a', prompt: '', createdAt: 1 })
        ).toBeNull();
        expect(normalizePendingBridgePromptRecord('bad')).toBeNull();
        expect(normalizePendingBridgePromptRecord([])).toBeNull();
        expect(createPendingBridgePromptRecord('   ')).toBeNull();
    });

    it('supports one-shot clearing by prompt id', async () => {
        const storage = createMemoryStorage();
        const proposalState = createProposalStateStorage(storage);

        await proposalState.setPendingBridgePrompt('Draft proposal', 'https://chatgpt.com/');
        const first = await proposalState.getPendingBridgePrompt();
        expect(first?.prompt).toBe('Draft proposal');

        await proposalState.clearPendingBridgePrompt('wrong-id');
        expect(await proposalState.getPendingBridgePrompt()).not.toBeNull();

        await proposalState.clearPendingBridgePrompt(first?.id);
        expect(storage.snapshot()[PENDING_BRIDGE_PROMPT_STORAGE_KEY]).toBeUndefined();
    });

    it('self-prunes invalid pending bridge prompts and removes storage for blank prompt updates', async () => {
        const storage = createMemoryStorage({
            [PENDING_BRIDGE_PROMPT_STORAGE_KEY]: {
                id: 'expired',
                prompt: 'old',
                createdAt: 1,
                expiresAt: 2,
            },
        });
        const proposalState = createProposalStateStorage(storage);

        await expect(proposalState.getPendingBridgePrompt()).resolves.toBeNull();
        expect(storage.snapshot()[PENDING_BRIDGE_PROMPT_STORAGE_KEY]).toBeUndefined();

        await proposalState.setPendingBridgePrompt('fresh', 'https://chatgpt.com/');
        expect(storage.snapshot()[PENDING_BRIDGE_PROMPT_STORAGE_KEY]).toBeDefined();
        await proposalState.setPendingBridgePrompt('   ', 'https://chatgpt.com/');
        expect(storage.snapshot()[PENDING_BRIDGE_PROMPT_STORAGE_KEY]).toBeUndefined();

        await proposalState.setPendingBridgePrompt('fresh again', 'https://chatgpt.com/');
        await proposalState.clearPendingBridgePrompt();
        expect(storage.snapshot()[PENDING_BRIDGE_PROMPT_STORAGE_KEY]).toBeUndefined();
    });

    it('normalizes, clones, clears, and rejects queued platform autofill drafts', async () => {
        const storage = createMemoryStorage({
            mostaql_pending_autofill: {
                projectId: '123',
                proposal: 'hello',
                amount: 100,
                duration: 5,
                timestamp: 1_000,
            },
        });
        const proposalState = createProposalStateStorage(storage);

        expect(normalizeQueuedAutofill(null, 'mostaql')).toBeNull();
        expect(normalizeQueuedAutofill({ projectId: '' }, 'mostaql')).toBeNull();
        await expect(proposalState.getQueuedAutofill('mostaql')).resolves.toEqual({
            platformId: 'mostaql',
            projectId: '123',
            proposal: 'hello',
            amount: 100,
            durationDays: 5,
            createdAt: 1_000,
        });

        const draft = await proposalState.getQueuedAutofill('mostaql');
        if (draft) {
            (draft as Mutable<typeof draft>).proposal = 'mutated locally';
        }
        await expect(proposalState.getQueuedAutofill('mostaql')).resolves.toMatchObject({
            proposal: 'hello',
        });

        await proposalState.queueAutofill({
            platformId: 'khamsat',
            projectId: '777',
            proposal: 'queued',
            amount: 50,
            durationDays: 3,
            createdAt: 2_000,
        });
        expect(storage.snapshot().khamsat_pending_autofill).toMatchObject({
            projectId: '777',
            duration: 3,
            timestamp: 2_000,
        });

        await proposalState.clearQueuedAutofill('khamsat');
        expect(storage.snapshot().khamsat_pending_autofill).toBeUndefined();
        await expect(proposalState.getQueuedAutofill('legacy' as PlatformId)).rejects.toThrow(
            'Proposal autofill is not supported for platform: legacy'
        );
        await expect(
            proposalState.queueAutofill({
                platformId: 'legacy' as PlatformId,
                projectId: '1',
                proposal: 'unsupported',
                amount: 0,
                durationDays: 0,
                createdAt: 0,
            })
        ).rejects.toThrow('Proposal autofill is not supported for platform: legacy');
    });

    it('removes pending bridge prompts from backup restore patches and keeps supported autofill only', () => {
        const patch = normalizeProposalStateBackupPatch({
            pendingChatGptPrompt: { prompt: 'secret' },
            mostaql_pending_autofill: {
                projectId: '123',
                proposal: 'hello',
                amount: 100,
                duration: 5,
                timestamp: 1_000,
            },
            legacy_pending_autofill: {
                projectId: 'unsupported',
            },
        });

        expect(patch.removeKeys).toContain(PENDING_BRIDGE_PROMPT_STORAGE_KEY);
        expect(Object.keys(patch.setItems)).toEqual(['mostaql_pending_autofill']);
        expect(Object.keys(patch.setItems).join(',')).not.toContain('legacy');
        expect(PROPOSAL_STATE_KEYS).toEqual([
            'mostaql_pending_autofill',
            'khamsat_pending_autofill',
            'nafezly_pending_autofill',
        ]);
    });
});
