import { describe, expect, it, vi } from 'vitest';

import type { TrackedProject } from '../../../../src/entities/job/model';
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
            aiExecutionMode: 'bridge',
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

    it('delegates prompt, tracking, notification, cleanup, and admin message operations', async () => {
        const local = createMemoryStorage();
        const session = createMemoryStorage();
        const storage = createExtensionStorage(local, session);

        // Prompts
        await storage.setPrompts([{ id: 'p1', title: 'P1', content: 'C1' }]);
        expect(await storage.getPrompts()).toEqual([{ id: 'p1', title: 'P1', content: 'C1' }]);

        // Proposal template
        await storage.setProposalTemplate('custom-template');
        expect(await storage.getProposalTemplate()).toBe('custom-template');

        // Notifications enabled
        await storage.setNotificationsEnabled(false);
        expect(await storage.getNotificationsEnabled()).toBe(false);

        // Tracked projects
        await storage.setTrackedProjects({
            'mostaql:1': {
                id: '1',
                platformId: 'mostaql',
                title: 'T1',
                url: 'https://mostaql.com/1',
                lastChecked: '2026-05-22',
            },
        });
        expect(Object.keys(await storage.getTrackedProjects())).toEqual(['mostaql:1']);

        // Runtime state and SignalR state
        await storage.patchRuntimeState({ lastPollingReason: 'test-poll' });
        expect((await storage.getRuntimeState()).lastPollingReason).toBe('test-poll');
        await storage.setSignalRState({
            status: 'connected',
            serverUrl: 'https://hub.example.com',
            connectionId: 'c1',
            instanceId: 'i1',
            reconnectAttempt: 0,
            lastConnectedAt: '2026-05-22T10:00:00Z',
            lastEventAt: '2026-05-22T10:00:00Z',
            lastDisconnectedAt: null,
            lastDisconnectReason: null,
            nextReconnectAt: null,
            leaseExpiresAt: '2026-05-22T10:30:00Z',
        });
        expect((await storage.getRuntimeState()).signalr.status).toBe('connected');

        // Unseen jobs and rememberJobsWithoutStats
        const testJob = {
            id: '99',
            platformId: 'mostaql' as const,
            title: 'Job 99',
            url: 'https://mostaql.com/project/99',
        };
        expect(await storage.getUnseenJobs([testJob])).toEqual([testJob]);
        await storage.rememberJobsWithoutStats([testJob]);
        expect(await storage.getUnseenJobs([testJob])).toEqual([]);

        // Notification payloads
        await storage.storeNotificationPayload('notif-1', {
            url: 'https://mostaql.com/1',
            jobId: '1',
            createdAt: '2026-05-22T10:00:00Z',
        });
        expect(await storage.consumeNotificationPayload('notif-1')).toMatchObject({
            jobId: '1',
        });
        await storage.storeNotificationPayload('notif-2', {
            url: 'https://mostaql.com/2',
            jobId: '2',
            createdAt: '2026-05-22T10:00:00Z',
        });
        await storage.removeNotificationPayload('notif-2');
        expect(await storage.consumeNotificationPayload('notif-2')).toBeNull();
        await storage.pruneNotificationPayloads();

        // Download cleanups
        await storage.storePendingDownloadCleanup({
            downloadId: 42,
            objectUrl: 'blob:test',
            filename: 'test.zip',
            createdAt: '2026-05-22T10:00:00Z',
        });
        expect(await storage.listPendingDownloadCleanups()).toHaveLength(1);
        expect(await storage.consumePendingDownloadCleanup(42)).toMatchObject({
            downloadId: 42,
        });
        await storage.pruneExpiredDownloadCleanups();

        // Admin messages
        await storage.storeAdminMessage({
            id: 'adm-1',
            message: 'Hello Admin',
            receivedAt: '2026-05-22T10:00:00Z',
            read: false,
        });
        expect(await storage.getAdminMessages()).toHaveLength(1);
        await storage.markAdminMessagesRead();
        expect((await storage.getAdminMessages())[0]?.read).toBe(true);
        await storage.clearAdminMessages();
        expect(await storage.getAdminMessages()).toEqual([]);
    });

    it('performs scoped storage reads for unseen jobs, rememberJobsWithoutStats, and ingestJobs', async () => {
        const local = createMemoryStorage({
            seenJobs: ['mostaql:1'],
            recentJobs: [],
            stats: {
                lastCheck: null,
                todayCount: 0,
                todayDate: new Date().toDateString(),
            },
            settings: DEFAULT_SETTINGS,
            notificationsEnabled: true,
            trackedProjects: {
                p1: { id: 'p1', platform: 'mostaql', title: 'T1' } as unknown as TrackedProject,
            },
            prompts: [{ id: 'pr1', title: 'Prompt 1', content: 'C1' }],
            runtime: DEFAULT_RUNTIME_STATE,
        });

        const getSpy = vi.spyOn(local, 'get');
        const session = createMemoryStorage();
        const storage = createExtensionStorage(local, session);

        const testJob = {
            id: '2',
            platformId: 'mostaql' as const,
            title: 'Job 2',
            url: 'https://mostaql.com/project/2',
        };

        // 1. getUnseenJobs only reads seenJobs
        getSpy.mockClear();
        const unseen = await storage.getUnseenJobs([testJob]);
        expect(unseen).toEqual([testJob]);
        expect(getSpy).toHaveBeenCalledWith('seenJobs');

        // 2. rememberJobsWithoutStats only reads seenJobs
        getSpy.mockClear();
        await storage.rememberJobsWithoutStats([testJob]);
        expect(getSpy).toHaveBeenCalledWith('seenJobs');

        // 3. ingestJobs only reads the 5 monitoring-relevant keys, not trackedProjects/prompts/runtime
        getSpy.mockClear();
        await storage.ingestJobs([testJob]);
        expect(getSpy).toHaveBeenCalledWith([
            'seenJobs',
            'recentJobs',
            'stats',
            'settings',
            'notificationsEnabled',
        ]);
    });
});
