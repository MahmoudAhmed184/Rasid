import { browser } from 'wxt/browser';

import '../shared/icon-shim.css';
import './popup.css';
import { requestCheckNow, requestDebugFetch } from '../../application/runtime/background-messages';
import type { MonitoringRepository } from '../../infrastructure/storage/repositories/monitoring-repository';

const POPUP_REFRESH_INTERVAL_MS = 30_000;

interface PopupDependencies {
    readonly monitoringRepository: Pick<
        MonitoringRepository,
        'getOverview' | 'getNotificationsEnabled' | 'setNotificationsEnabled'
    >;
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
        button.className = 'btn secondary';
        setButtonContent(button, 'fa-bell', 'الإشعارات: مفعلة');
        return;
    }

    button.className = 'btn toggle-off';
    setButtonContent(button, 'fa-bell-slash', 'الإشعارات: متوقفة');
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

    async function openDashboard() {
        await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
    }

    async function handleCheckNow(button: HTMLButtonElement) {
        button.disabled = true;
        button.classList.add('is-loading');
        setButtonContent(button, 'fa-sync-alt', 'جاري الفحص...');

        try {
            await requestCheckNow();
            await loadStats(deps);
        } finally {
            button.disabled = false;
            button.classList.remove('is-loading');
            setButtonContent(button, 'fa-sync-alt', 'فحص الآن');
        }
    }

    async function handleDiagnostics(button: HTMLButtonElement, report: HTMLElement) {
        button.disabled = true;
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
            setButtonContent(button, 'fa-plug', 'فحص الاتصال بالمصادر (Diagnostics)');
        }
    }

    async function toggleNotifications(button: HTMLButtonElement) {
        const currentState = await deps.monitoringRepository.getNotificationsEnabled();
        const newState = !currentState;

        await deps.monitoringRepository.setNotificationsEnabled(newState);
        updateToggleUi(button, newState);
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
    }

    async function init() {
        bindEvents();
        await Promise.all([loadStats(deps), syncNotificationToggle(deps)]);

        refreshTimer = window.setInterval(() => {
            void loadStats(deps);
        }, POPUP_REFRESH_INTERVAL_MS);
    }

    function destroy() {
        if (refreshTimer !== null) {
            window.clearInterval(refreshTimer);
            refreshTimer = null;
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
