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
});
