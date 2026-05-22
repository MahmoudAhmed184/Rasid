import { describe, expect, it } from 'vitest';

import { createNotificationPayloadStorage } from '../../../../src/shared/storage/modules/notification-payload-storage';
import { createMemoryStorage } from '../../../support/fake-storage';
import { useFixedSystemTime } from '../../../support/timers';

describe('notification payload storage', () => {
    it('consumes notification payloads once', async () => {
        const storage = createMemoryStorage();
        const notifications = createNotificationPayloadStorage(storage);

        await notifications.storeNotificationPayload('n1', {
            url: 'https://mostaql.com/projects/1',
            jobId: '1',
            createdAt: '2026-05-22T10:00:00.000Z',
        });

        expect(await notifications.consumeNotificationPayload('n1')).toMatchObject({
            url: 'https://mostaql.com/projects/1',
            jobId: '1',
        });
        expect(await notifications.consumeNotificationPayload('n1')).toBeNull();
    });

    it('defaults missing timestamps and removes notification payloads explicitly', async () => {
        useFixedSystemTime('2026-05-22T12:00:00.000Z');
        const storage = createMemoryStorage();
        const notifications = createNotificationPayloadStorage(storage);

        await notifications.storeNotificationPayload('n2', {
            url: 'https://nafezly.com/project/2',
            createdAt: '',
        });
        expect(storage.snapshot()['notification:n2']).toEqual({
            url: 'https://nafezly.com/project/2',
            createdAt: '2026-05-22T12:00:00.000Z',
        });

        await notifications.removeNotificationPayload('n2');
        expect(storage.snapshot()).toEqual({});
    });

    it('returns null for malformed consumed payloads while removing them once', async () => {
        const storage = createMemoryStorage({
            'notification:bad-job': {
                url: 'https://mostaql.com/projects/1',
                jobId: 123,
                createdAt: '2026-05-22T10:00:00.000Z',
            },
        });
        const notifications = createNotificationPayloadStorage(storage);

        await expect(notifications.consumeNotificationPayload('bad-job')).resolves.toBeNull();
        expect(storage.snapshot()).toEqual({});
    });

    it('prunes expired and malformed notification payload records', async () => {
        useFixedSystemTime('2026-05-22T12:00:00.000Z');
        const storage = createMemoryStorage({
            'notification:fresh': {
                url: 'https://khamsat.com/community/requests/1',
                createdAt: '2026-05-22T11:00:00.000Z',
            },
            'notification:old': {
                url: 'https://khamsat.com/community/requests/2',
                createdAt: '2026-05-20T11:00:00.000Z',
            },
            'notification:bad': {
                url: '',
            },
            'notification:bad-date': {
                url: 'https://khamsat.com/community/requests/3',
                createdAt: 'not-a-date',
            },
            unrelated: {
                url: '',
            },
        });
        const notifications = createNotificationPayloadStorage(storage);

        expect(await notifications.pruneNotificationPayloads()).toBe(3);
        expect(Object.keys(storage.snapshot()).sort()).toEqual(['notification:fresh', 'unrelated']);
    });
});
