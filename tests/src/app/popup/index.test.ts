import { describe, expect, it, vi } from 'vitest';

import type { MonitoringOverview } from '../../../../src/features/monitoring/repository';
import { DEFAULT_RUNTIME_STATE } from '../../../../src/shared/storage/schema';
import { fakeBrowser } from '../../../support/fake-browser';
import { installTestDom } from '../../../support/html';

vi.mock('../../../../src/app/background/background-messages', () => ({
    requestCheckNow: vi.fn(async () => ({
        kind: 'noop',
        source: 'polling',
        reason: 'no-new-jobs',
        totalChecked: 0,
    })),
    requestDebugFetch: vi.fn(async () => ({
        success: true,
        length: 42,
    })),
}));

function createOverview(overrides: Partial<MonitoringOverview> = {}): MonitoringOverview {
    return {
        stats: {
            lastCheck: '2026-05-22T11:55:00.000Z',
            todayCount: 4,
            todayDate: new Date().toDateString(),
        },
        seenJobsCount: 12,
        notificationsEnabled: true,
        runtime: DEFAULT_RUNTIME_STATE,
        notificationMode: 'auto',
        ...overrides,
    };
}

function stubAdminMessages() {
    return {
        getAdminMessages: vi.fn(async () => []),
        markAdminMessagesRead: vi.fn(async () => undefined),
    };
}

describe('popup controller', () => {
    it('loads stats, opens dashboard, checks now, toggles notifications, and runs diagnostics', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const tabsCreate = vi.spyOn(fakeBrowser.tabs, 'create');
        const root = installTestDom(`
            <button id="open-dashboard-btn"></button>
            <button id="checkNowBtn"></button>
            <button id="toggleNotificationsBtn"></button>
            <button id="checkConnectionBtn"></button>
            <div id="connectionReport" class="hidden"></div>
            <span id="lastCheck"></span>
            <span id="todayCount"></span>
            <span id="totalSeen"></span>
        `);
        let notificationsEnabled = true;
        const monitoringRepository = {
            getOverview: vi.fn(async () => createOverview()),
            getNotificationsEnabled: vi.fn(async () => notificationsEnabled),
            setNotificationsEnabled: vi.fn(async (enabled: boolean) => {
                notificationsEnabled = enabled;
                return enabled;
            }),
        };
        const { bootstrapPopup } = await import('../../../../src/app/popup');
        const { requestCheckNow, requestDebugFetch } =
            await import('../../../../src/app/background/background-messages');

        bootstrapPopup(root, { monitoringRepository, adminMessages: stubAdminMessages() });

        await vi.waitFor(() => expect(root.getElementById('todayCount')?.textContent).toBe('4'));
        expect(root.getElementById('totalSeen')?.textContent).toBe('12');
        expect(root.getElementById('lastCheck')?.textContent).toContain('5 دقيقة');

        root.getElementById('open-dashboard-btn')?.click();
        await vi.waitFor(() =>
            expect(tabsCreate).toHaveBeenCalledWith({
                url: fakeBrowser.runtime.getURL('/dashboard.html'),
            })
        );

        root.getElementById('checkNowBtn')?.click();
        await vi.waitFor(() => expect(requestCheckNow).toHaveBeenCalledOnce());
        await vi.waitFor(() =>
            expect(root.getElementById('connectionReport')?.textContent).toBe(
                'تم الفحص وتحديث الإحصائيات.'
            )
        );

        root.getElementById('toggleNotificationsBtn')?.click();
        await vi.waitFor(() =>
            expect(monitoringRepository.setNotificationsEnabled).toHaveBeenCalledWith(false)
        );
        expect(root.getElementById('connectionReport')?.textContent).toBe('تم إيقاف الإشعارات.');

        root.getElementById('checkConnectionBtn')?.click();
        await vi.waitFor(() => expect(requestDebugFetch).toHaveBeenCalledOnce());
        expect(root.getElementById('connectionReport')?.textContent).toContain('42 بايت');
    });

    it('surfaces diagnostics errors without throwing', async () => {
        vi.useFakeTimers();
        const root = installTestDom(`
            <button id="open-dashboard-btn"></button>
            <button id="checkNowBtn"></button>
            <button id="toggleNotificationsBtn"></button>
            <button id="checkConnectionBtn"></button>
            <div id="connectionReport" class="hidden"></div>
            <span id="lastCheck"></span>
            <span id="todayCount"></span>
            <span id="totalSeen"></span>
        `);
        const { requestDebugFetch } =
            await import('../../../../src/app/background/background-messages');
        vi.mocked(requestDebugFetch).mockResolvedValueOnce({
            success: false,
            error: 'No monitoring platforms are enabled.',
        });
        const { bootstrapPopup } = await import('../../../../src/app/popup');

        bootstrapPopup(root, {
            monitoringRepository: {
                getOverview: async () =>
                    createOverview({
                        stats: {
                            lastCheck: null,
                            todayCount: 0,
                            todayDate: new Date().toDateString(),
                        },
                        seenJobsCount: 0,
                    }),
                getNotificationsEnabled: async () => true,
                setNotificationsEnabled: async (enabled: boolean) => enabled,
            },
            adminMessages: stubAdminMessages(),
        });

        root.getElementById('checkConnectionBtn')?.click();

        await vi.waitFor(() =>
            expect(root.getElementById('connectionReport')?.textContent).toContain(
                'No monitoring platforms are enabled.'
            )
        );
    });

    it('formats immediate checks, uses diagnostic fallback text, and toggles notifications on', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const root = installTestDom(`
            <button id="open-dashboard-btn"></button>
            <button id="checkNowBtn"></button>
            <button id="toggleNotificationsBtn"></button>
            <button id="checkConnectionBtn"></button>
            <div id="connectionReport" class="hidden"></div>
            <span id="lastCheck"></span>
            <span id="todayCount"></span>
            <span id="totalSeen"></span>
        `);
        const { requestDebugFetch } =
            await import('../../../../src/app/background/background-messages');
        vi.mocked(requestDebugFetch)
            .mockResolvedValueOnce({ success: true })
            .mockResolvedValueOnce({ success: false });
        let notificationsEnabled = false;
        const monitoringRepository = {
            getOverview: vi.fn(async () =>
                createOverview({
                    stats: {
                        lastCheck: '2026-05-22T12:00:00.000Z',
                        todayCount: 0,
                        todayDate: new Date().toDateString(),
                    },
                    seenJobsCount: 0,
                })
            ),
            getNotificationsEnabled: vi.fn(async () => notificationsEnabled),
            setNotificationsEnabled: vi.fn(async (enabled: boolean) => {
                notificationsEnabled = enabled;
                return enabled;
            }),
        };
        const { bootstrapPopup } = await import('../../../../src/app/popup');

        bootstrapPopup(root, { monitoringRepository, adminMessages: stubAdminMessages() });

        await vi.waitFor(() =>
            expect(root.getElementById('lastCheck')?.textContent).toBe('آخر فحص: الآن')
        );
        expect(root.getElementById('todayCount')?.textContent).toBe('0');
        expect(root.getElementById('toggleNotificationsBtn')?.textContent).toContain(
            'الإشعارات: متوقفة'
        );

        root.getElementById('toggleNotificationsBtn')?.click();
        await vi.waitFor(() =>
            expect(root.getElementById('connectionReport')?.textContent).toBe('تم تفعيل الإشعارات.')
        );

        root.getElementById('checkConnectionBtn')?.click();
        await vi.waitFor(() =>
            expect(root.getElementById('connectionReport')?.textContent).toContain('0 بايت')
        );

        root.getElementById('checkConnectionBtn')?.click();
        await vi.waitFor(() =>
            expect(root.getElementById('connectionReport')?.textContent).toContain('خطأ غير معروف')
        );
    });

    it('surfaces check-now and notification toggle failures while restoring button state', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const root = installTestDom(`
            <button id="open-dashboard-btn"></button>
            <button id="checkNowBtn"></button>
            <button id="toggleNotificationsBtn"></button>
            <button id="checkConnectionBtn"></button>
            <div id="connectionReport" class="hidden"></div>
            <span id="lastCheck"></span>
            <span id="todayCount"></span>
            <span id="totalSeen"></span>
        `);
        const { requestCheckNow } =
            await import('../../../../src/app/background/background-messages');
        vi.mocked(requestCheckNow).mockRejectedValueOnce(new Error('polling failed'));
        const monitoringRepository = {
            getOverview: vi.fn(async () =>
                createOverview({
                    stats: {
                        lastCheck: 'not-a-date',
                        todayCount: 0,
                        todayDate: new Date().toDateString(),
                    },
                })
            ),
            getNotificationsEnabled: vi.fn(async () => true),
            setNotificationsEnabled: vi.fn(async () => {
                throw new Error('storage denied');
            }),
        };
        const { bootstrapPopup } = await import('../../../../src/app/popup');

        bootstrapPopup(root, { monitoringRepository, adminMessages: stubAdminMessages() });

        await vi.waitFor(() =>
            expect(root.getElementById('lastCheck')?.textContent).toBe('لم يتم الفحص بعد')
        );

        const checkNowButton = root.getElementById('checkNowBtn') as HTMLButtonElement;
        checkNowButton.click();
        await vi.waitFor(() =>
            expect(root.getElementById('connectionReport')?.textContent).toBe(
                'تعذر تنفيذ الفحص الآن. أعد المحاولة أو افتح لوحة التحكم للتحقق من حالة الاتصال.'
            )
        );
        expect(checkNowButton.disabled).toBe(false);
        expect(checkNowButton.getAttribute('aria-busy')).toBe('false');
        expect(checkNowButton.textContent).toContain('فحص الآن');

        const toggleButton = root.getElementById('toggleNotificationsBtn') as HTMLButtonElement;
        toggleButton.click();
        await vi.waitFor(() =>
            expect(root.getElementById('connectionReport')?.textContent).toBe(
                'تعذر تغيير حالة الإشعارات. حاول مرة أخرى.'
            )
        );
        expect(toggleButton.disabled).toBe(false);
        expect(toggleButton.getAttribute('aria-busy')).toBe('false');
        expect(toggleButton.textContent).toContain('الإشعارات: مفعلة');
    });

    it('shows resolved manual-check failures as popup errors', async () => {
        vi.useFakeTimers();
        const root = installTestDom(`
            <button id="open-dashboard-btn"></button>
            <button id="checkNowBtn"></button>
            <button id="toggleNotificationsBtn"></button>
            <button id="checkConnectionBtn"></button>
            <div id="connectionReport" class="hidden"></div>
            <span id="lastCheck"></span>
            <span id="todayCount"></span>
            <span id="totalSeen"></span>
        `);
        const { requestCheckNow } =
            await import('../../../../src/app/background/background-messages');
        vi.mocked(requestCheckNow).mockResolvedValueOnce({
            kind: 'failed',
            source: 'polling',
            reason: 'fetch-failed',
            totalChecked: 0,
            monitoringErrors: {
                mostaql: {
                    message: 'مستقل: Request failed with HTTP 403.',
                    failedAt: '2026-05-22T12:00:00.000Z',
                },
            },
        });
        const monitoringRepository = {
            getOverview: vi.fn(async () => createOverview()),
            getNotificationsEnabled: vi.fn(async () => true),
            setNotificationsEnabled: vi.fn(async (enabled: boolean) => enabled),
        };
        const { bootstrapPopup } = await import('../../../../src/app/popup');

        bootstrapPopup(root, { monitoringRepository, adminMessages: stubAdminMessages() });

        root.getElementById('checkNowBtn')?.click();

        await vi.waitFor(() =>
            expect(root.getElementById('connectionReport')?.textContent).toBe(
                'تعذر تنفيذ الفحص: مستقل: Request failed with HTTP 403.'
            )
        );
        expect(root.getElementById('connectionReport')?.className).toBe('connection-report error');
    });

    it('handles thrown diagnostics errors and stops periodic refresh on unload', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const root = installTestDom(`
            <button id="open-dashboard-btn"></button>
            <button id="checkNowBtn"></button>
            <button id="toggleNotificationsBtn"></button>
            <button id="checkConnectionBtn"></button>
            <div id="connectionReport" class="hidden"></div>
            <span id="lastCheck"></span>
            <span id="todayCount"></span>
            <span id="totalSeen"></span>
        `);
        const { requestDebugFetch } =
            await import('../../../../src/app/background/background-messages');
        vi.mocked(requestDebugFetch).mockRejectedValueOnce(new Error('network down'));
        const monitoringRepository = {
            getOverview: vi.fn(async () =>
                createOverview({
                    stats: {
                        lastCheck: '2026-05-20T12:00:00.000Z',
                        todayCount: 2,
                        todayDate: new Date().toDateString(),
                    },
                })
            ),
            getNotificationsEnabled: vi.fn(async () => false),
            setNotificationsEnabled: vi.fn(async (enabled: boolean) => enabled),
        };
        const { bootstrapPopup } = await import('../../../../src/app/popup');

        bootstrapPopup(root, { monitoringRepository, adminMessages: stubAdminMessages() });

        await vi.waitFor(() =>
            expect(root.getElementById('lastCheck')?.textContent).toContain('آخر فحص:')
        );
        expect(root.getElementById('toggleNotificationsBtn')?.textContent).toContain(
            'الإشعارات: متوقفة'
        );

        root.getElementById('checkConnectionBtn')?.click();
        await vi.waitFor(() =>
            expect(root.getElementById('connectionReport')?.textContent).toContain('network down')
        );

        await vi.advanceTimersByTimeAsync(30_000);
        expect(monitoringRepository.getOverview).toHaveBeenCalledTimes(2);

        root.defaultView?.dispatchEvent(new Event('pagehide'));
        await vi.advanceTimersByTimeAsync(30_000);
        expect(monitoringRepository.getOverview).toHaveBeenCalledTimes(2);
    });

    it('renders admin message banner, handles safe and unsafe links, and dismisses messages', async () => {
        const root = installTestDom(`
            <button id="open-dashboard-btn"></button>
            <button id="checkNowBtn"></button>
            <button id="toggleNotificationsBtn"></button>
            <button id="checkConnectionBtn"></button>
            <div id="connectionReport" class="hidden"></div>
            <span id="lastCheck"></span>
            <span id="todayCount"></span>
            <span id="totalSeen"></span>
            <div id="adminMessagesBanner" class="hidden">
                <span id="adminMessageText"></span>
                <a id="adminMessageLink" class="hidden">تفاصيل</a>
                <span id="adminMessagesBadge" class="hidden"></span>
                <button id="dismissAdminMessageBtn"></button>
            </div>
        `);
        const messages = [
            {
                id: 'adm-1',
                message: 'Important system notice',
                url: 'https://example.com/update',
                receivedAt: '2026-05-22T10:00:00Z',
                read: false,
            },
            {
                id: 'adm-2',
                message: 'Older unread message',
                receivedAt: '2026-05-22T09:00:00Z',
                read: false,
            },
        ];
        const markAdminMessagesRead = vi.fn(async () => {
            for (const m of messages) {
                m.read = true;
            }
        });
        const monitoringRepository = {
            getOverview: vi.fn(async () => createOverview()),
            getNotificationsEnabled: vi.fn(async () => true),
            setNotificationsEnabled: vi.fn(async (enabled: boolean) => enabled),
        };
        const { bootstrapPopup } = await import('../../../../src/app/popup');

        bootstrapPopup(root, {
            monitoringRepository,
            adminMessages: {
                getAdminMessages: vi.fn(async () => messages),
                markAdminMessagesRead,
            },
        });

        await vi.waitFor(() =>
            expect(root.getElementById('adminMessageText')?.textContent).toBe(
                'Important system notice'
            )
        );
        const banner = root.getElementById('adminMessagesBanner');
        expect(banner?.classList.contains('hidden')).toBe(false);

        const link = root.getElementById('adminMessageLink') as HTMLAnchorElement;
        expect(link.classList.contains('hidden')).toBe(false);
        expect(link.href).toBe('https://example.com/update');

        const badge = root.getElementById('adminMessagesBadge');
        expect(badge?.classList.contains('hidden')).toBe(false);
        expect(badge?.textContent).toBe('2');

        // Dismiss messages
        const dismissBtn = root.getElementById('dismissAdminMessageBtn') as HTMLButtonElement;
        dismissBtn.click();
        await vi.waitFor(() => expect(markAdminMessagesRead).toHaveBeenCalledOnce());
        expect(banner?.classList.contains('hidden')).toBe(true);
    });

    it('rejects unsafe admin message links like javascript: scheme', async () => {
        const root = installTestDom(`
            <button id="open-dashboard-btn"></button>
            <button id="checkNowBtn"></button>
            <button id="toggleNotificationsBtn"></button>
            <button id="checkConnectionBtn"></button>
            <div id="connectionReport" class="hidden"></div>
            <span id="lastCheck"></span>
            <span id="todayCount"></span>
            <span id="totalSeen"></span>
            <div id="adminMessagesBanner" class="hidden">
                <span id="adminMessageText"></span>
                <a id="adminMessageLink" class="hidden">تفاصيل</a>
                <span id="adminMessagesBadge" class="hidden"></span>
                <button id="dismissAdminMessageBtn"></button>
            </div>
        `);
        const messages = [
            {
                id: 'adm-bad',
                message: 'Attack attempt',
                url: 'javascript:alert(1)',
                receivedAt: '2026-05-22T10:00:00Z',
                read: false,
            },
        ];
        const monitoringRepository = {
            getOverview: vi.fn(async () => createOverview()),
            getNotificationsEnabled: vi.fn(async () => true),
            setNotificationsEnabled: vi.fn(async (enabled: boolean) => enabled),
        };
        const { bootstrapPopup } = await import('../../../../src/app/popup');

        bootstrapPopup(root, {
            monitoringRepository,
            adminMessages: {
                getAdminMessages: vi.fn(async () => messages),
                markAdminMessagesRead: vi.fn(async () => undefined),
            },
        });

        await vi.waitFor(() =>
            expect(root.getElementById('adminMessageText')?.textContent).toBe('Attack attempt')
        );
        const link = root.getElementById('adminMessageLink') as HTMLAnchorElement;
        expect(link.classList.contains('hidden')).toBe(true);
        expect(link.getAttribute('href')).toBeNull();
    });

    it('cleans up refresh timer and storage listeners when popup unloads via beforeunload', async () => {
        vi.useFakeTimers();
        const root = installTestDom(`
            <button id="open-dashboard-btn"></button>
            <button id="checkNowBtn"></button>
            <button id="toggleNotificationsBtn"></button>
            <span id="lastCheck"></span>
            <span id="todayCount"></span>
            <span id="totalSeen"></span>
        `);
        const monitoringRepository = {
            getOverview: vi.fn(async () => createOverview()),
            getNotificationsEnabled: vi.fn(async () => true),
            setNotificationsEnabled: vi.fn(async (enabled: boolean) => enabled),
        };
        const removeListener = vi.spyOn(fakeBrowser.storage.onChanged, 'removeListener');
        const { bootstrapPopup } = await import('../../../../src/app/popup');

        bootstrapPopup(root, {
            monitoringRepository,
            adminMessages: stubAdminMessages(),
        });

        await vi.waitFor(() =>
            expect(root.getElementById('lastCheck')?.textContent).toContain('آخر فحص:')
        );

        root.defaultView?.dispatchEvent(new Event('beforeunload'));
        expect(removeListener).toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(30_000);
        expect(monitoringRepository.getOverview).toHaveBeenCalledTimes(1);
    });
});
