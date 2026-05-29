import { browser } from 'wxt/browser';

import '../../shared/dom/icon-shim.css';
import './popup.css';
import { requestCheckNow, requestDebugFetch } from '../background/background-messages';
import type { MonitoringRepository } from '../../features/monitoring/repository';
import type { AdminMessage } from '../../shared/storage/modules/admin-message-storage';

const POPUP_REFRESH_INTERVAL_MS = 30_000;

interface AdminMessageDeps {
    getAdminMessages(): Promise<AdminMessage[]>;
    markAdminMessagesRead(): Promise<void>;
}

interface PopupDependencies {
    readonly monitoringRepository: Pick<
        MonitoringRepository,
        'getOverview' | 'getNotificationsEnabled' | 'setNotificationsEnabled'
    >;
    readonly adminMessages: AdminMessageDeps;
}

function getElement<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function createIcon(iconClass: string): HTMLElement {
    const icon = document.createElement('i');
    icon.className = `fas ${iconClass}`;
    return icon;
}

function setButtonContent(button: HTMLButtonElement, iconClass: string, label: string): void {
    const text = document.createElement('span');
    text.textContent = label;
    button.replaceChildren(createIcon(iconClass), text);
}

function formatLastCheck(lastCheckValue: string | null | undefined): string {
    if (!lastCheckValue) {
        return 'لم يتم الفحص بعد';
    }

    const lastCheck = new Date(lastCheckValue);

    if (Number.isNaN(lastCheck.getTime())) {
        return 'لم يتم الفحص بعد';
    }

    const diffMinutes = Math.floor((Date.now() - lastCheck.getTime()) / 60000);

    if (diffMinutes < 1) {
        return 'آخر فحص: الآن';
    }

    if (diffMinutes < 60) {
        return `آخر فحص: منذ ${diffMinutes} دقيقة`;
    }

    if (diffMinutes < 1440) {
        return `آخر فحص: منذ ${Math.floor(diffMinutes / 60)} ساعة`;
    }

    return `آخر فحص: ${lastCheck.toLocaleDateString('ar-SA')}`;
}

function updateToggleUi(button: HTMLButtonElement, isEnabled: boolean) {
    if (isEnabled) {
        button.className = 'btn action secondary';
        setButtonContent(button, 'fa-bell', 'الإشعارات: مفعلة');
        return;
    }

    button.className = 'btn action toggle-off';
    setButtonContent(button, 'fa-bell-slash', 'الإشعارات: متوقفة');
}

function showPopupStatus(tone: 'success' | 'error' | 'info', message: string) {
    const report = getElement<HTMLElement>('connectionReport');

    if (!report) {
        return;
    }

    report.className = `connection-report ${tone}`;
    report.classList.remove('hidden');
    report.textContent = message;
}

function hidePopupStatus() {
    const report = getElement<HTMLElement>('connectionReport');

    if (!report) {
        return;
    }

    report.className = 'connection-report hidden';
    report.textContent = '';
}

function renderAdminMessageBanner(messages: AdminMessage[]): void {
    const banner = getElement<HTMLElement>('adminMessagesBanner');
    const textEl = getElement<HTMLElement>('adminMessageText');
    const linkEl = getElement<HTMLAnchorElement>('adminMessageLink');
    const badgeEl = getElement<HTMLElement>('adminMessagesBadge');

    if (!banner || !textEl) {
        return;
    }

    const unread = messages.filter((m) => !m.read);

    if (unread.length === 0) {
        banner.classList.add('hidden');
        return;
    }

    const latest = unread[0]!;
    textEl.textContent = latest.message;

    if (linkEl) {
        if (latest.url) {
            linkEl.href = latest.url;
            linkEl.classList.remove('hidden');
        } else {
            linkEl.classList.add('hidden');
        }
    }

    if (badgeEl) {
        badgeEl.textContent = unread.length > 1 ? String(unread.length) : '';
        badgeEl.classList.toggle('hidden', unread.length <= 1);
    }

    banner.classList.remove('hidden');
}

async function loadStats(deps: PopupDependencies) {
    const overview = await deps.monitoringRepository.getOverview();
    const stats = overview.stats;

    const lastCheckEl = getElement<HTMLElement>('lastCheck');
    const todayCountEl = getElement<HTMLElement>('todayCount');
    const totalSeenEl = getElement<HTMLElement>('totalSeen');

    if (lastCheckEl) {
        lastCheckEl.textContent = formatLastCheck(stats.lastCheck);
    }

    if (todayCountEl) {
        todayCountEl.textContent = String(stats.todayCount ?? 0);
    }

    if (totalSeenEl) {
        totalSeenEl.textContent = String(overview.seenJobsCount);
    }
}

async function syncNotificationToggle(deps: PopupDependencies) {
    const button = getElement<HTMLButtonElement>('toggleNotificationsBtn');

    if (!button) {
        return;
    }

    updateToggleUi(button, await deps.monitoringRepository.getNotificationsEnabled());
}

function createPopupController(deps: PopupDependencies) {
    let refreshTimer: number | null = null;
    let storageChangeListener: ((changes: Record<string, unknown>) => void) | null = null;

    async function loadAdminMessages(): Promise<void> {
        try {
            const messages = await deps.adminMessages.getAdminMessages();
            renderAdminMessageBanner(messages);
        } catch (error) {
            console.warn('[popup] failed to load admin messages:', error);
        }
    }

    async function dismissAdminMessages(): Promise<void> {
        try {
            await deps.adminMessages.markAdminMessagesRead();
            getElement<HTMLElement>('adminMessagesBanner')?.classList.add('hidden');
        } catch (error) {
            console.warn('[popup] failed to dismiss admin messages:', error);
        }
    }

    async function openDashboard() {
        await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
    }

    async function handleCheckNow(button: HTMLButtonElement) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.classList.add('is-loading');
        setButtonContent(button, 'fa-sync-alt', 'جاري الفحص...');
        hidePopupStatus();

        try {
            await requestCheckNow();
            await loadStats(deps);
            showPopupStatus('success', 'تم الفحص وتحديث الإحصائيات.');
        } catch (error) {
            console.error('Error checking now:', error);
            showPopupStatus(
                'error',
                'تعذر تنفيذ الفحص الآن. أعد المحاولة أو افتح لوحة التحكم للتحقق من حالة الاتصال.'
            );
        } finally {
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
            button.classList.remove('is-loading');
            setButtonContent(button, 'fa-sync-alt', 'فحص الآن');
        }
    }

    async function handleDiagnostics(button: HTMLButtonElement, report: HTMLElement) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        setButtonContent(button, 'fa-plug', 'جاري التشخيص...');
        report.className = 'connection-report hidden';

        try {
            const response = await requestDebugFetch();

            report.classList.remove('hidden');

            if (response.success) {
                report.className = 'connection-report success';
                report.textContent = `✓ الاتصال ناجح. تم جلب ${response.length ?? 0} بايت من المصادر المفعلة.`;
            } else {
                report.className = 'connection-report error';
                report.textContent = `✗ فشل الاتصال: ${response.error ?? 'خطأ غير معروف'}. تأكد من تفعيل منصة واحدة على الأقل وفتحها عند الحاجة.`;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'خطأ غير معروف';
            report.className = 'connection-report error';
            report.classList.remove('hidden');
            report.textContent = `✗ فشل الاتصال: ${message}. تأكد من تفعيل منصة واحدة على الأقل وفتحها عند الحاجة.`;
        } finally {
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
            setButtonContent(button, 'fa-plug', 'فحص الاتصال بالمصادر');
        }
    }

    async function toggleNotifications(button: HTMLButtonElement) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');

        try {
            const currentState = await deps.monitoringRepository.getNotificationsEnabled();
            const newState = !currentState;

            await deps.monitoringRepository.setNotificationsEnabled(newState);
            updateToggleUi(button, newState);
            showPopupStatus('success', newState ? 'تم تفعيل الإشعارات.' : 'تم إيقاف الإشعارات.');
        } catch (error) {
            console.error('Error toggling notifications:', error);
            showPopupStatus('error', 'تعذر تغيير حالة الإشعارات. حاول مرة أخرى.');
            await syncNotificationToggle(deps).catch((syncError: unknown) => {
                console.error('Error resyncing notification toggle:', syncError);
            });
        } finally {
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
        }
    }

    function bindEvents() {
        getElement<HTMLButtonElement>('open-dashboard-btn')?.addEventListener('click', () => {
            void openDashboard();
        });

        getElement<HTMLButtonElement>('checkNowBtn')?.addEventListener('click', (event) => {
            void handleCheckNow(event.currentTarget as HTMLButtonElement);
        });

        const connectionButton = getElement<HTMLButtonElement>('checkConnectionBtn');
        const report = getElement<HTMLElement>('connectionReport');
        if (connectionButton && report) {
            connectionButton.addEventListener('click', (event) => {
                void handleDiagnostics(event.currentTarget as HTMLButtonElement, report);
            });
        }

        getElement<HTMLButtonElement>('toggleNotificationsBtn')?.addEventListener(
            'click',
            (event) => {
                void toggleNotifications(event.currentTarget as HTMLButtonElement);
            }
        );

        getElement<HTMLButtonElement>('dismissAdminMessageBtn')?.addEventListener('click', () => {
            void dismissAdminMessages();
        });
    }

    async function init() {
        bindEvents();
        await Promise.all([loadStats(deps), syncNotificationToggle(deps), loadAdminMessages()]);

        refreshTimer = window.setInterval(() => {
            void loadStats(deps);
        }, POPUP_REFRESH_INTERVAL_MS);

        // Re-render banner in real-time if a message arrives while popup is open
        storageChangeListener = () => {
            void loadAdminMessages();
        };
        browser.storage.local.onChanged.addListener(storageChangeListener);
    }

    function destroy() {
        if (refreshTimer !== null) {
            window.clearInterval(refreshTimer);
            refreshTimer = null;
        }

        if (storageChangeListener) {
            browser.storage.local.onChanged.removeListener(storageChangeListener);
            storageChangeListener = null;
        }
    }

    return {
        init,
        destroy,
    };
}

export function bootstrapPopup(root: Document = document, deps: PopupDependencies) {
    const controller = createPopupController(deps);
    void controller.init();

    root.defaultView?.addEventListener(
        'unload',
        () => {
            controller.destroy();
        },
        { once: true }
    );
}
