import { afterEach, describe, expect, it, vi } from 'vitest';

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

function useBrowserBuild(browser: 'chrome' | 'firefox'): void {
    vi.stubEnv('BROWSER', browser);
}

describe('notification service', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

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

    it('creates Firefox-compatible basic job notifications without rich fields', async () => {
        useBrowserBuild('firefox');
        const create = vi.spyOn(fakeBrowser.notifications, 'create');
        const { storage } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        await service.showJobsNotification([
            {
                id: 'firefox-1',
                platformId: 'mostaql',
                title: 'فرصة فايرفوكس',
                url: 'https://mostaql.com/project/firefox-1',
                budget: '$500',
                description: 'وصف مناسب لاختبار إشعار فايرفوكس',
            },
        ]);

        expect(create).toHaveBeenCalledOnce();
        expect(create.mock.calls[0]?.[1]).toEqual({
            type: 'basic',
            iconUrl: fakeBrowser.runtime.getURL('/platforms/Mostql.png'),
            title: 'مشروع جديد: فرصة فايرفوكس',
            message: expect.stringContaining('وصف مناسب لاختبار إشعار فايرفوكس'),
        });
    });

    it('keeps Chrome job notification context and action buttons', async () => {
        useBrowserBuild('chrome');
        const create = vi.spyOn(fakeBrowser.notifications, 'create');
        const { storage } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        await service.showJobsNotification([
            {
                id: 'chrome-1',
                platformId: 'mostaql',
                title: 'فرصة كروم',
                url: 'https://mostaql.com/project/chrome-1',
            },
        ]);

        expect(create.mock.calls[0]?.[1]).toMatchObject({
            type: 'basic',
            iconUrl: fakeBrowser.runtime.getURL('/platforms/Mostql.png'),
            title: 'مشروع جديد: فرصة كروم',
            contextMessage: 'Frelancia - مستقل',
            buttons: [{ title: '🔗 عرض تفاصيل المشروع' }],
        });
    });

    it('removes stored click payloads when browser notification creation fails', async () => {
        vi.spyOn(fakeBrowser.notifications, 'create').mockRejectedValueOnce(
            new Error('Property "buttons" is unsupported by Firefox')
        );
        const { storage, payloads } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        await expect(
            service.showJobsNotification([
                {
                    id: 'failed-1',
                    platformId: 'mostaql',
                    title: 'فشل الإشعار',
                    url: 'https://mostaql.com/project/failed-1',
                },
            ])
        ).rejects.toThrow('Property "buttons" is unsupported by Firefox');

        expect(storage.storeNotificationPayload).toHaveBeenCalledOnce();
        expect(storage.removeNotificationPayload).toHaveBeenCalledWith(expect.any(String));
        expect(payloads.size).toBe(0);
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
