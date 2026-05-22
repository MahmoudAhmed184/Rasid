import { describe, expect, it } from 'vitest';

import { createMonitoringStorage } from '../../../../src/shared/storage/modules/monitoring-storage';
import { DEFAULT_RUNTIME_STATE, DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import type { StoredState } from '../../../../src/shared/storage/schema';
import { createMemoryStorage } from '../../../support/fake-storage';
import { useFixedSystemTime } from '../../../support/timers';

function createSnapshot(overrides: Partial<StoredState> = {}): StoredState {
    return {
        settings: DEFAULT_SETTINGS,
        seenJobs: [],
        recentJobs: [],
        stats: {
            lastCheck: null,
            todayCount: 3,
            todayDate: 'Thu May 21 2026',
        },
        trackedProjects: {},
        prompts: [],
        proposalTemplate: '',
        notificationsEnabled: true,
        runtime: DEFAULT_RUNTIME_STATE,
        ...overrides,
    };
}

describe('monitoring storage', () => {
    it('ingests unseen jobs, deduplicates seen keys, and resets daily stats', async () => {
        useFixedSystemTime('2026-05-22T12:00:00.000Z');
        const client = createMemoryStorage();
        const storage = createMonitoringStorage(client);
        const result = await storage.ingestJobs(createSnapshot({ seenJobs: ['mostaql:1'] }), [
            {
                id: '1',
                platformId: 'mostaql',
                title: 'old',
                url: 'https://mostaql.com/project/1',
            },
            {
                id: '2',
                platformId: 'mostaql',
                title: 'new',
                url: 'https://mostaql.com/project/2',
            },
        ]);

        expect(result.newJobs.map((job) => job.id)).toEqual(['2']);
        expect(result.stats.todayCount).toBe(1);
        expect(result.stats.todayDate).toBe(new Date().toDateString());
        expect(client.snapshot()).toMatchObject({
            seenJobs: ['mostaql:1', 'mostaql:2'],
        });
    });

    it('merges recent jobs through persisted storage', async () => {
        const client = createMemoryStorage({
            recentJobs: [
                {
                    id: '1',
                    platformId: 'mostaql',
                    title: 'old',
                    url: 'https://mostaql.com/project/1',
                },
            ],
        });
        const storage = createMonitoringStorage(client);

        await expect(
            storage.mergeRecentJobs([
                {
                    id: '2',
                    platformId: 'khamsat',
                    title: 'new',
                    url: 'https://khamsat.com/community/requests/2',
                },
            ])
        ).resolves.toHaveLength(2);
    });

    it('touches last check and records the polling reason in runtime state', async () => {
        useFixedSystemTime('2026-05-22T12:00:00.000Z');
        const client = createMemoryStorage();
        const storage = createMonitoringStorage(client);

        const stats = await storage.touchLastCheck(DEFAULT_RUNTIME_STATE, 'manual');

        expect(stats.lastCheck).toBe('2026-05-22T12:00:00.000Z');
        expect(client.snapshot().runtime).toMatchObject({
            lastPollingReason: 'manual',
        });
    });
});
