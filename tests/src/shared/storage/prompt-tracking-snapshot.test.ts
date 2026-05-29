import { describe, expect, it } from 'vitest';

import { createExtensionStorage } from '../../../../src/shared/storage/extension-storage';
import {
    clonePrompts,
    createPromptStorage,
    normalizePrompts,
} from '../../../../src/shared/storage/modules/prompt-storage';
import {
    createTrackingStorage,
    normalizeTrackedProjects,
} from '../../../../src/shared/storage/modules/tracking-storage';
import { DEFAULT_PROMPTS } from '../../../../src/shared/storage/schema';
import { normalizeImportedState } from '../../../../src/shared/storage/snapshot-state';
import { createMemoryStorage } from '../../../support/fake-storage';

describe('prompt, tracking, and snapshot storage', () => {
    it('normalizes prompt templates and clones returned values', async () => {
        const prompts = normalizePrompts([
            { id: 'a', title: 'Title', content: 'Content' },
            { id: '', title: 'Bad', content: 'Bad' },
        ]);
        expect(prompts).toEqual([{ id: 'a', title: 'Title', content: 'Content' }]);
        expect(normalizePrompts(undefined)).toEqual(DEFAULT_PROMPTS);

        const cloned = clonePrompts(prompts);
        cloned[0]!.title = 'Changed';
        expect(prompts[0]?.title).toBe('Title');

        const client = createMemoryStorage();
        const storage = createPromptStorage(client);
        await storage.setPrompts(prompts);
        expect((await storage.getPrompts())[0]?.title).toBe('Title');
    });

    it('normalizes tracked projects from qualified keys and strips invalid records', async () => {
        const normalized = normalizeTrackedProjects({
            'khamsat:777': {
                url: 'https://khamsat.com/community/requests/777',
                title: 'طلب',
                attachments: [{ name: 'spec.pdf', url: 'https://khamsat.com/spec.pdf' }],
            },
            bad: {
                title: 'missing url',
            },
        });

        expect(normalized['khamsat:777']).toMatchObject({
            id: '777',
            platformId: 'khamsat',
            title: 'طلب',
        });
        expect(normalized.bad).toBeUndefined();

        const client = createMemoryStorage({ trackedProjects: normalized });
        const storage = createTrackingStorage(client);
        const projects = await storage.getTrackedProjects();
        projects['khamsat:777']!.title = 'mutated';
        expect((await storage.getTrackedProjects())['khamsat:777']?.title).toBe('طلب');
    });

    it('rejects non-object backup imports and sanitizes imported snapshots', () => {
        expect(() => normalizeImportedState(null)).toThrow('Invalid backup payload.');
        expect(
            normalizeImportedState({
                settings: {
                    aiApiKey: 'secret',
                    monitoredPlatforms: {
                        mostaql: true,
                        khamsat: true,
                        nafezly: true,
                        unknown: true,
                    },
                },
                notificationsEnabled: false,
            }).settings.aiApiKey
        ).toBe('');
    });

    it('ensures default snapshot fields and migrates legacy API keys to secret storage', async () => {
        const persistent = createMemoryStorage({
            settings: {
                aiApiKey: 'legacy-secret',
                interval: 7,
            },
        });
        const session = createMemoryStorage();
        const storage = createExtensionStorage(persistent, session);

        const snapshot = await storage.ensureDefaults();

        expect(snapshot.settings.aiApiKey).toBe('');
        expect(session.snapshot().aiApiKeySecret).toBe('legacy-secret');
        expect(persistent.snapshot()).toMatchObject({
            settings: expect.objectContaining({ aiApiKey: '' }),
            seenJobs: [],
            recentJobs: [],
            trackedProjects: {},
        });
    });
});
