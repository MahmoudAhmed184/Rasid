import { describe, expect, it, vi } from 'vitest';

import { createNotificationService } from '../../../../src/features/notifications/service';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';
import { fakeBrowser } from '../../../support/fake-browser';

function createStorage() {
    const payloads = new Map<string, { url: string; jobId?: string; createdAt: string }>();

    return {
        payloads,
        storage: {
            storeNotificationPayload: vi.fn(async (id, payload) => {
                payloads.set(id, payload);
            }),
            removeNotificationPayload: vi.fn(async (id) => {
                payloads.delete(id);
            }),
            consumeNotificationPayload: vi.fn(async (id) => {
                const payload = payloads.get(id) ?? null;
                payloads.delete(id);
                return payload;
            }),
            pruneNotificationPayloads: vi.fn(async () => 0),
        } satisfies Pick<
            ExtensionStorage,
            | 'storeNotificationPayload'
            | 'removeNotificationPayload'
            | 'consumeNotificationPayload'
            | 'pruneNotificationPayloads'
        >,
    };
}

describe('notification service', () => {
    it('stores sanitized click payloads and creates Arabic browser notifications', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_000);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const create = vi.spyOn(fakeBrowser.notifications, 'create');
        const { storage, payloads } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        const id = await service.showJobsNotification([
            {
                id: '123',
                platformId: 'mostaql',
                title: 'فرصة اختبار',
                url: 'https://user:secret@mostaql.com/project/123#token',
                budget: '$500',
                description: 'وصف طويل',
            },
        ]);

        expect(id).toMatch(/^frelancia-/);
        expect(payloads.get(id)).toMatchObject({
            url: 'https://mostaql.com/project/123',
            jobId: '123',
        });
        expect(create).toHaveBeenCalledWith(
            id,
            expect.objectContaining({
                type: 'basic',
                title: 'مشروع جديد: فرصة اختبار',
                message: expect.stringContaining('وصف طويل'),
            })
        );
    });

    it('does not store click payloads for unsupported URLs', async () => {
        const { storage, payloads } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        await service.showJobsNotification([
            {
                id: '1',
                platformId: 'mostaql',
                title: 'Bad URL',
                url: 'https://evil.example/project/1',
            },
        ]);

        expect(payloads.size).toBe(0);
        expect(storage.storeNotificationPayload).not.toHaveBeenCalled();
    });

    it('opens sanitized stored URLs on notification clicks and removes closed payloads', async () => {
        const tabsCreate = vi.spyOn(fakeBrowser.tabs, 'create');
        const { storage, payloads } = createStorage();
        payloads.set('n1', {
            url: 'https://khamsat.com/community/requests/1#frag',
            createdAt: '2026-05-22T10:00:00.000Z',
        });
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        service.registerHandlers();
        service.registerHandlers();
        await fakeBrowser.notifications.onClicked.trigger('n1');
        await fakeBrowser.notifications.onClosed.trigger('n1');

        await vi.waitFor(() =>
            expect(tabsCreate).toHaveBeenCalledWith({
                url: 'https://khamsat.com/community/requests/1',
            })
        );
        expect(storage.removeNotificationPayload).toHaveBeenCalledWith('n1');
        expect(storage.pruneNotificationPayloads).toHaveBeenCalledOnce();
    });
});
