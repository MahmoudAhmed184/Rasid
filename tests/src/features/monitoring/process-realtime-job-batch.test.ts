import { describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';
import { processRealtimeJobBatch } from '../../../../src/features/monitoring/process-realtime-job-batch';
import { DEFAULT_RUNTIME_STATE, DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';
import type { StoredState } from '../../../../src/shared/storage/schema';

function createSnapshot(overrides: Partial<StoredState> = {}): StoredState {
    return {
        settings: DEFAULT_SETTINGS,
        seenJobs: [],
        recentJobs: [],
        stats: {
            lastCheck: null,
            todayCount: 0,
            todayDate: new Date().toDateString(),
        },
        trackedProjects: {},
        prompts: [],
        proposalTemplate: '',
        notificationsEnabled: true,
        runtime: DEFAULT_RUNTIME_STATE,
        ...overrides,
    };
}

function createStorage(snapshot: StoredState, ingestedJobs: JobRecord[] = []) {
    return {
        getSnapshot: vi.fn(async () => snapshot),
        touchLastCheck: vi.fn(async () => snapshot.stats),
        ingestJobs: vi.fn(async (jobs: JobRecord[]) => ({
            newJobs: ingestedJobs.length > 0 ? ingestedJobs : jobs,
            seenJobs: jobs.map((job) => `${job.platformId}:${job.id}`),
            recentJobs: jobs,
            stats: snapshot.stats,
            settings: snapshot.settings,
            notificationsEnabled: snapshot.notificationsEnabled,
        })),
    } satisfies Pick<ExtensionStorage, 'getSnapshot' | 'touchLastCheck' | 'ingestJobs'>;
}

const jobs: JobRecord[] = [
    {
        id: '1',
        platformId: 'mostaql',
        title: 'TypeScript project',
        description: 'browser extension',
        url: 'https://mostaql.com/project/1',
        budget: '$500',
        hiringRate: '90%',
        duration: '5 أيام',
    },
];

describe('realtime job batch processing', () => {
    it('touches last check and no-ops when the system is disabled', async () => {
        const storage = createStorage(
            createSnapshot({
                settings: {
                    ...DEFAULT_SETTINGS,
                    systemEnabled: false,
                },
                seenJobs: ['mostaql:1'],
            })
        );

        await expect(
            processRealtimeJobBatch({
                jobs,
                storage: storage as unknown as ExtensionStorage,
                notifyJobs: async () => undefined,
            })
        ).resolves.toEqual({
            kind: 'noop',
            source: 'signalr',
            reason: 'system-disabled',
            totalChecked: 1,
        });
        expect(storage.touchLastCheck).toHaveBeenCalledWith('signalr-disabled');
    });

    it('normalizes, filters, ingests, and publishes eligible realtime jobs', async () => {
        const notifyJobs = vi.fn(async () => undefined);
        const playNotificationSound = vi.fn(async () => undefined);
        const storage = createStorage(
            createSnapshot({
                settings: {
                    ...DEFAULT_SETTINGS,
                    keywordsInclude: 'typescript',
                    monitoredPlatforms: {
                        mostaql: true,
                        khamsat: false,
                        nafezly: true,
                    },
                },
            })
        );

        await expect(
            processRealtimeJobBatch({
                jobs: [
                    ...jobs,
                    {
                        id: '2',
                        platformId: 'khamsat',
                        title: 'TypeScript disabled platform',
                        url: 'https://khamsat.com/community/requests/2',
                    },
                ],
                storage: storage as unknown as ExtensionStorage,
                notifyJobs,
                playNotificationSound,
            })
        ).resolves.toMatchObject({
            kind: 'published',
            source: 'signalr',
            newJobs: 1,
        });
        expect(storage.ingestJobs).toHaveBeenCalledWith([expect.objectContaining({ id: '1' })]);
        expect(notifyJobs).toHaveBeenCalledWith([expect.objectContaining({ id: '1' })]);
        expect(playNotificationSound).toHaveBeenCalledOnce();
    });
});
