import { describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';
import { DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import { publishJobBatch } from '../../../../src/features/monitoring/job-batch-publisher';

const jobs: JobRecord[] = [
    {
        id: '1',
        platformId: 'mostaql',
        title: 'مشروع',
        url: 'https://mostaql.com/project/1',
    },
];

describe('job batch publisher', () => {
    it('returns a no-op result for empty batches', async () => {
        await expect(
            publishJobBatch({
                source: 'polling',
                jobs: [],
                totalChecked: 10,
                settings: DEFAULT_SETTINGS,
                notificationsEnabled: true,
                notifyJobs: async () => undefined,
            })
        ).resolves.toEqual({
            kind: 'noop',
            source: 'polling',
            reason: 'no-new-jobs',
            totalChecked: 10,
        });
    });

    it('publishes notifications and sound only when enabled', async () => {
        const notifyJobs = vi.fn(async () => undefined);
        const playNotificationSound = vi.fn(async () => undefined);

        await expect(
            publishJobBatch({
                source: 'signalr',
                jobs,
                totalChecked: 1,
                settings: DEFAULT_SETTINGS,
                notificationsEnabled: true,
                notifyJobs,
                playNotificationSound,
            })
        ).resolves.toMatchObject({
            kind: 'published',
            notificationsSent: true,
        });
        expect(notifyJobs).toHaveBeenCalledWith(jobs);
        expect(playNotificationSound).toHaveBeenCalledOnce();
    });

    it('suppresses notifications during quiet hours', async () => {
        const notifyJobs = vi.fn(async () => undefined);

        await expect(
            publishJobBatch({
                source: 'polling',
                jobs,
                totalChecked: 1,
                settings: {
                    ...DEFAULT_SETTINGS,
                    quietHoursEnabled: true,
                    quietHoursStart: '00:00',
                    quietHoursEnd: '23:59',
                },
                notificationsEnabled: true,
                notifyJobs,
            })
        ).resolves.toMatchObject({
            kind: 'suppressed',
            suppressed: 1,
        });
        expect(notifyJobs).not.toHaveBeenCalled();
    });

    it('triggers notification sound only once per batch regardless of job count', async () => {
        const notifyJobs = vi.fn(async () => ['id-1', 'id-2', 'id-3']);
        const playNotificationSound = vi.fn(async () => undefined);

        const multiJobs: JobRecord[] = [
            {
                id: '1',
                platformId: 'mostaql',
                title: 'مشروع 1',
                url: 'https://mostaql.com/project/1',
            },
            {
                id: '2',
                platformId: 'khamsat',
                title: 'مشروع 2',
                url: 'https://khamsat.com/design/2',
            },
            {
                id: '3',
                platformId: 'nafezly',
                title: 'مشروع 3',
                url: 'https://nafezly.com/project/3',
            },
        ];

        const result = await publishJobBatch({
            source: 'signalr',
            jobs: multiJobs,
            totalChecked: 3,
            settings: DEFAULT_SETTINGS,
            notificationsEnabled: true,
            notifyJobs,
            playNotificationSound,
        });

        expect(result).toMatchObject({
            kind: 'published',
            newJobs: 3,
            notificationsSent: true,
        });
        expect(notifyJobs).toHaveBeenCalledOnce();
        expect(notifyJobs).toHaveBeenCalledWith(multiJobs);
        expect(playNotificationSound).toHaveBeenCalledOnce();
    });
});
