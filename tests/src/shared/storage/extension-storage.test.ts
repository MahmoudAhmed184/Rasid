import { describe, expect, it, vi } from 'vitest';

import { createExtensionStorage } from '../../../../src/shared/storage/extension-storage';
import {
    DEFAULT_PROMPTS,
    DEFAULT_RUNTIME_STATE,
    DEFAULT_SETTINGS,
} from '../../../../src/shared/storage/schema';
import { createMemoryStorage } from '../../../support/fake-storage';
import { useFixedSystemTime } from '../../../support/timers';

describe('extension storage facade', () => {
    it('normalizes snapshots, writes missing defaults, and migrates legacy API keys to session storage', async () => {
        const local = createMemoryStorage({
            settings: {
                aiApiKey: '  sk-legacy  ',
                interval: 99,
                monitoredPlatforms: {
                    mostaql: true,
                    legacyMarketplace: true,
                },
            },
            prompts: [{ id: 'custom', title: 'Custom', content: 'Body' }],
            notificationsEnabled: false,
            runtime: {
                signalr: {
                    status: 'connected',
                },
            },
        });
        const session = createMemoryStorage();
        const storage = createExtensionStorage(local, session);

        const snapshot = await storage.ensureDefaults();

        expect(snapshot.settings.interval).toBe(30);
        expect(snapshot.settings.aiApiKey).toBe('');
        expect(Object.hasOwn(snapshot.settings.monitoredPlatforms, 'legacyMarketplace')).toBe(
            false
        );
        expect(snapshot.prompts).toEqual([{ id: 'custom', title: 'Custom', content: 'Body' }]);
        expect(snapshot.notificationsEnabled).toBe(false);
        expect(session.snapshot().aiApiKeySecret).toBe('sk-legacy');
        expect(local.snapshot().settings).toMatchObject({
            aiApiKey: '',
            interval: 30,
        });
        expect(local.snapshot()).toMatchObject({
            seenJobs: [],
            recentJobs: [],
            trackedProjects: {},
            runtime: DEFAULT_RUNTIME_STATE,
        });
    });

    it('does not rewrite storage when an existing snapshot is already normalized', async () => {
        const local = createMemoryStorage({
            settings: DEFAULT_SETTINGS,
            seenJobs: [],
            recentJobs: [],
            stats: {
                lastCheck: null,
                todayCount: 0,
                todayDate: new Date().toDateString(),
            },
            trackedProjects: {},
            prompts: DEFAULT_PROMPTS,
            proposalTemplate: 'template',
            notificationsEnabled: true,
            runtime: DEFAULT_RUNTIME_STATE,
        });
        const set = vi.spyOn(local, 'set');
        const storage = createExtensionStorage(local, createMemoryStorage());

        await expect(storage.ensureDefaults()).resolves.toMatchObject({
            settings: DEFAULT_SETTINGS,
            prompts: DEFAULT_PROMPTS,
        });
        expect(set).not.toHaveBeenCalled();
    });

    it('hydrates settings with session secrets while keeping persistent settings stripped', async () => {
        const local = createMemoryStorage({
            settings: {
                ...DEFAULT_SETTINGS,
                aiExecutionMode: 'direct',
                aiApiKey: '',
            },
        });
        const session = createMemoryStorage({
            aiApiKeySecret: 'sk-session',
        });
        const storage = createExtensionStorage(local, session);

        await expect(storage.getSettings()).resolves.toMatchObject({
            aiExecutionMode: 'direct',
            aiApiKey: 'sk-session',
        });
        await expect(storage.updateSettings({ aiApiKey: 'sk-next' })).resolves.toMatchObject({
            aiApiKey: 'sk-next',
        });
        expect(session.snapshot().aiApiKeySecret).toBe('sk-next');
        expect(local.snapshot().settings).toMatchObject({ aiApiKey: '' });
    });

    it('coordinates monitoring operations through normalized snapshots', async () => {
        useFixedSystemTime('2026-05-22T12:00:00.000Z');
        const local = createMemoryStorage({
            seenJobs: ['mostaql:1'],
            recentJobs: [],
            stats: {
                lastCheck: null,
                todayCount: 4,
                todayDate: 'Thu May 21 2026',
            },
            runtime: DEFAULT_RUNTIME_STATE,
        });
        const storage = createExtensionStorage(local, createMemoryStorage());

        await expect(
            storage.ingestJobs([
                {
                    id: '1',
                    platformId: 'mostaql',
                    title: 'Old',
                    url: 'https://mostaql.com/project/1',
                },
                {
                    id: '2',
                    platformId: 'mostaql',
                    title: 'New',
                    url: 'https://mostaql.com/project/2',
                },
            ])
        ).resolves.toMatchObject({
            newJobs: [
                {
                    id: '2',
                    platformId: 'mostaql',
                },
            ],
            stats: {
                todayCount: 1,
                lastCheck: '2026-05-22T12:00:00.000Z',
            },
        });

        await expect(
            storage.mergeRecentJobs([
                {
                    id: '3',
                    platformId: 'khamsat',
                    title: 'Recent',
                    url: 'https://khamsat.com/community/requests/3',
                },
            ])
        ).resolves.toEqual([
            expect.objectContaining({ id: '3', platformId: 'khamsat' }),
            expect.objectContaining({ id: '2', platformId: 'mostaql' }),
            expect.objectContaining({ id: '1', platformId: 'mostaql' }),
        ]);
        await expect(storage.touchLastCheck('manual')).resolves.toMatchObject({
            lastCheck: '2026-05-22T12:00:00.000Z',
        });
        expect(local.snapshot().runtime).toMatchObject({
            lastPollingReason: 'manual',
        });
    });
});
