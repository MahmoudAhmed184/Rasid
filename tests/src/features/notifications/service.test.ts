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

        const ids = await service.showJobsNotification([
            {
                id: '123',
                platformId: 'mostaql',
                title: 'فرصة اختبار',
                url: 'https://user:secret@mostaql.com/project/123#token',
                budget: '$500',
                description: 'وصف طويل',
            },
        ]);

        expect(ids).toHaveLength(1);
        const [id] = ids;
        expect(id).toMatch(/^rasid-/);
        expect(payloads.get(id!)).toMatchObject({
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
        await fakeBrowser.notifications.onClosed.trigger('n1', true);

        await vi.waitFor(() =>
            expect(tabsCreate).toHaveBeenCalledWith({
                url: 'https://khamsat.com/community/requests/1',
            })
        );
        expect(storage.removeNotificationPayload).toHaveBeenCalledWith('n1');
        expect(storage.pruneNotificationPayloads).toHaveBeenCalledOnce();
    });

    it('creates separate notifications and storage payloads for every job in a batch', async () => {
        useBrowserBuild('chrome');
        const create = vi.spyOn(fakeBrowser.notifications, 'create');
        const { storage, payloads } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        const jobs = [
            {
                id: 'job-mostaql',
                platformId: 'mostaql',
                title: 'تطوير تطبيق ويب',
                url: 'https://mostaql.com/project/job-mostaql',
                budget: '$500 - $1000',
                description:
                    'مطلوب مطور React خبير لبناء منصة إدارة أعمال متكاملة وسريعة الاستجابة',
            },
            {
                id: 'job-khamsat',
                platformId: 'khamsat',
                title: 'تصميم واجهة متجر',
                url: 'https://khamsat.com/design/job-khamsat',
                budget: '25 $',
                description: 'مطلوب تصميم واجهة احترافية لمتجر سلة مع ملفات فيجما مفتوحة المصدر',
            },
            {
                id: 'job-nafezly',
                platformId: 'nafezly',
                title: 'برمجة سكريبت أتمتة',
                url: 'https://nafezly.com/project/job-nafezly',
                budget: '150 $',
                description: 'سكريبت بلغة بايثون لجلب البيانات وتنظيفها وتصديرها إلى ملف إكسل',
            },
        ] as const;

        const ids = await service.showJobsNotification([...jobs]);

        expect(ids).toHaveLength(3);
        expect(new Set(ids).size).toBe(3);
        ids.forEach((id) => expect(id).toMatch(/^rasid-/));

        expect(create).toHaveBeenCalledTimes(3);

        // Job 1 (Mostaql)
        const id0 = ids[0]!;
        expect(payloads.get(id0)).toEqual({
            url: 'https://mostaql.com/project/job-mostaql',
            jobId: 'job-mostaql',
            createdAt: expect.any(String),
        });
        expect(create).toHaveBeenNthCalledWith(1, id0, {
            type: 'basic',
            iconUrl: fakeBrowser.runtime.getURL('/platforms/Mostql.png'),
            title: 'مشروع جديد: تطوير تطبيق ويب',
            message:
                'الميزانية: $500 - $1000\nمطلوب مطور React خبير لبناء منصة إدارة أعمال متكاملة وسريعة الاستجابة...',
            buttons: [{ title: '🔗 عرض تفاصيل المشروع' }],
            priority: 2,
            requireInteraction: true,
        });

        // Job 2 (Khamsat)
        const id1 = ids[1]!;
        expect(payloads.get(id1)).toEqual({
            url: 'https://khamsat.com/design/job-khamsat',
            jobId: 'job-khamsat',
            createdAt: expect.any(String),
        });
        expect(create).toHaveBeenNthCalledWith(2, id1, {
            type: 'basic',
            iconUrl: fakeBrowser.runtime.getURL('/platforms/Khamsat.png'),
            title: 'مشروع جديد: تصميم واجهة متجر',
            message:
                'الميزانية: 25 $\nمطلوب تصميم واجهة احترافية لمتجر سلة مع ملفات فيجما مفتوحة المصدر...',
            buttons: [{ title: '🔗 عرض تفاصيل المشروع' }],
            priority: 2,
            requireInteraction: true,
        });

        // Job 3 (Nafezly)
        const id2 = ids[2]!;
        expect(payloads.get(id2)).toEqual({
            url: 'https://nafezly.com/project/job-nafezly',
            jobId: 'job-nafezly',
            createdAt: expect.any(String),
        });
        expect(create).toHaveBeenNthCalledWith(3, id2, {
            type: 'basic',
            iconUrl: fakeBrowser.runtime.getURL('/platforms/Nafezly.png'),
            title: 'مشروع جديد: برمجة سكريبت أتمتة',
            message:
                'الميزانية: 150 $\nسكريبت بلغة بايثون لجلب البيانات وتنظيفها وتصديرها إلى ملف إكسل...',
            buttons: [{ title: '🔗 عرض تفاصيل المشروع' }],
            priority: 2,
            requireInteraction: true,
        });
    });

    it('opens the correct individual job URL when respective notification is clicked', async () => {
        const tabsCreate = vi.spyOn(fakeBrowser.tabs, 'create');
        const { storage } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);
        service.registerHandlers();

        const [id1, id2] = await service.showJobsNotification([
            {
                id: 'm-1',
                platformId: 'mostaql',
                title: 'المشروع الأول',
                url: 'https://mostaql.com/project/m-1',
            },
            {
                id: 'm-2',
                platformId: 'mostaql',
                title: 'المشروع الثاني',
                url: 'https://mostaql.com/project/m-2',
            },
        ]);

        await fakeBrowser.notifications.onClicked.trigger(id1!);
        await vi.waitFor(() =>
            expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://mostaql.com/project/m-1' })
        );

        await fakeBrowser.notifications.onClicked.trigger(id2!);
        await vi.waitFor(() =>
            expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://mostaql.com/project/m-2' })
        );
    });

    it('returns empty array when given an empty job list', async () => {
        const create = vi.spyOn(fakeBrowser.notifications, 'create');
        const { storage, payloads } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        const ids = await service.showJobsNotification([]);

        expect(ids).toEqual([]);
        expect(create).not.toHaveBeenCalled();
        expect(payloads.size).toBe(0);
    });

    it('cleans up failed job payload when one notification fails during batch creation', async () => {
        const create = vi
            .spyOn(fakeBrowser.notifications, 'create')
            .mockResolvedValueOnce(undefined as never)
            .mockRejectedValueOnce(new Error('Notification limit reached'));
        const { storage, payloads } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        await expect(
            service.showJobsNotification([
                {
                    id: 'success-1',
                    platformId: 'mostaql',
                    title: 'الناجح',
                    url: 'https://mostaql.com/project/success-1',
                },
                {
                    id: 'fail-2',
                    platformId: 'mostaql',
                    title: 'الفاشل',
                    url: 'https://mostaql.com/project/fail-2',
                },
            ])
        ).rejects.toThrow('Notification limit reached');

        expect(create).toHaveBeenCalledTimes(2);
        expect(payloads.size).toBe(1);
        expect([...payloads.values()][0]?.jobId).toBe('success-1');
        expect(storage.removeNotificationPayload).toHaveBeenCalledOnce();
    });

    it('falls back to generic platform label and icon when platform is unknown or unsupported', async () => {
        useBrowserBuild('chrome');
        const create = vi.spyOn(fakeBrowser.notifications, 'create');
        const { storage } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        const ids = await service.showJobsNotification([
            {
                id: 'unknown-1',
                title: 'مشروع منصة خارجية',
                url: 'https://example.com/jobs/1',
            },
        ]);

        expect(ids).toHaveLength(1);
        expect(create).toHaveBeenCalledWith(
            ids[0],
            expect.objectContaining({
                iconUrl: fakeBrowser.runtime.getURL('/icons/icon128.png'),
                title: 'مشروع جديد: مشروع منصة خارجية',
            })
        );
    });

    it('sanitizes whitespace in title, budget, and description and avoids placeholder dots for empty description', async () => {
        const create = vi.spyOn(fakeBrowser.notifications, 'create');
        const { storage } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        await service.showJobsNotification([
            {
                id: 'whitespace-1',
                platformId: 'mostaql',
                title: '  مشروع مع مسافات  ',
                budget: '   ',
                description: '   ',
                url: 'https://mostaql.com/project/ws-1',
            },
        ]);

        expect(create).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                title: 'مشروع جديد: مشروع مع مسافات',
                message: '',
            })
        );
    });

    it('opens individual job URLs when Chrome notification action button is clicked', async () => {
        useBrowserBuild('chrome');
        const tabsCreate = vi.spyOn(fakeBrowser.tabs, 'create');
        const { storage, payloads } = createStorage();
        payloads.set('btn-1', {
            url: 'https://mostaql.com/project/btn-1',
            jobId: 'btn-1',
            createdAt: '2026-05-22T10:00:00.000Z',
        });
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        service.registerHandlers();
        await fakeBrowser.notifications.onButtonClicked?.trigger('btn-1', 0);

        await vi.waitFor(() =>
            expect(tabsCreate).toHaveBeenCalledWith({
                url: 'https://mostaql.com/project/btn-1',
            })
        );
        expect(storage.consumeNotificationPayload).toHaveBeenCalledWith('btn-1');
        expect(payloads.has('btn-1')).toBe(false);
    });

    it('creates a test notification and returns its notification ID', async () => {
        useBrowserBuild('chrome');
        const create = vi.spyOn(fakeBrowser.notifications, 'create');
        const { storage, payloads } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        const testId = await service.showTestNotification();

        expect(testId).toMatch(/^rasid-/);
        expect(create).toHaveBeenCalledWith(
            testId,
            expect.objectContaining({
                title: expect.stringContaining('إشعار تجريبي'),
            })
        );
        expect(payloads.has(testId)).toBe(true);
    });

    it('creates admin message notification with developer broadcast title and payload', async () => {
        useBrowserBuild('chrome');
        const create = vi.spyOn(fakeBrowser.notifications, 'create');
        const { storage, payloads } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        const adminId = await service.showAdminMessageNotification({
            id: 'admin-msg-1',
            message: 'تحديث أمني مهم للنظام',
            url: 'https://mostaql.com/announcements/update',
            receivedAt: '2026-05-22T10:00:00.000Z',
            read: false,
        });

        expect(adminId).toMatch(/^rasid-admin-/);
        expect(create).toHaveBeenCalledWith(
            adminId,
            expect.objectContaining({
                title: '📢 تنبيهات من المطورين',
                message: 'تحديث أمني مهم للنظام',
            })
        );
        expect(payloads.get(adminId)).toMatchObject({
            url: 'https://mostaql.com/announcements/update',
        });
    });

    it('staggers notification creation across batches in Chromium builds to prevent toast aggregation', async () => {
        useBrowserBuild('chrome');
        const timestamps: number[] = [];
        vi.spyOn(fakeBrowser.notifications, 'create').mockImplementation(async () => {
            timestamps.push(Date.now());
            return 'ok';
        });
        const { storage } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage, {
            staggerMs: 80,
        });

        const jobs = [
            {
                id: 'j-1',
                platformId: 'mostaql' as const,
                title: 'Job 1',
                url: 'https://mostaql.com/project/1',
            },
            {
                id: 'j-2',
                platformId: 'mostaql' as const,
                title: 'Job 2',
                url: 'https://mostaql.com/project/2',
            },
            {
                id: 'j-3',
                platformId: 'mostaql' as const,
                title: 'Job 3',
                url: 'https://mostaql.com/project/3',
            },
        ];

        const ids = await service.showJobsNotification(jobs);

        expect(ids).toHaveLength(3);
        expect(timestamps).toHaveLength(3);
        expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(75);
        expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(75);
    });

    it('does not stagger notification creation in Firefox builds', async () => {
        useBrowserBuild('firefox');
        const timestamps: number[] = [];
        vi.spyOn(fakeBrowser.notifications, 'create').mockImplementation(async () => {
            timestamps.push(Date.now());
            return 'ok';
        });
        const { storage } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage);

        const jobs = [
            {
                id: 'f-1',
                platformId: 'mostaql' as const,
                title: 'Job 1',
                url: 'https://mostaql.com/project/1',
            },
            {
                id: 'f-2',
                platformId: 'mostaql' as const,
                title: 'Job 2',
                url: 'https://mostaql.com/project/2',
            },
        ];

        const ids = await service.showJobsNotification(jobs);

        expect(ids).toHaveLength(2);
        expect(timestamps).toHaveLength(2);
        // Synchronous / non-delayed execution completes in less than 50ms
        expect(timestamps[1]! - timestamps[0]!).toBeLessThan(50);
    });

    it('creates independent notifications and click routing for multiple jobs from the same platform', async () => {
        useBrowserBuild('chrome');
        const tabsCreate = vi.spyOn(fakeBrowser.tabs, 'create');
        const { storage, payloads } = createStorage();
        const service = createNotificationService(storage as unknown as ExtensionStorage, {
            staggerMs: 10,
        });
        service.registerHandlers();

        const jobs = [
            {
                id: 'same-1',
                platformId: 'mostaql' as const,
                title: 'مشروع مستقل 1',
                url: 'https://mostaql.com/project/same-1',
            },
            {
                id: 'same-2',
                platformId: 'mostaql' as const,
                title: 'مشروع مستقل 2',
                url: 'https://mostaql.com/project/same-2',
            },
        ];

        const [id1, id2] = await service.showJobsNotification(jobs);

        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2);
        expect(payloads.get(id1!)?.url).toBe('https://mostaql.com/project/same-1');
        expect(payloads.get(id2!)?.url).toBe('https://mostaql.com/project/same-2');

        // Clicking first notification opens project 1
        await fakeBrowser.notifications.onClicked.trigger(id1!);
        await vi.waitFor(() =>
            expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://mostaql.com/project/same-1' })
        );

        // Clicking action button on second notification opens project 2
        await fakeBrowser.notifications.onButtonClicked?.trigger(id2!, 0);
        await vi.waitFor(() =>
            expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://mostaql.com/project/same-2' })
        );
    });

    it('executes notification creation and storage payload persistence concurrently', async () => {
        let createFinished = false;
        let storeFinished = false;
        const { storage } = createStorage();

        vi.spyOn(fakeBrowser.notifications, 'create').mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 20));
            createFinished = true;
            return 'notif-1';
        });

        vi.spyOn(storage, 'storeNotificationPayload').mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 20));
            storeFinished = true;
        });

        const service = createNotificationService(storage as unknown as ExtensionStorage);
        await service.showTestNotification();

        expect(createFinished).toBe(true);
        expect(storeFinished).toBe(true);
    });
});
