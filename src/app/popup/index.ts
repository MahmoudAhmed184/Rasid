import { browser } from 'wxt/browser';

import '../../shared/dom/icon-shim.css';
import './popup.css';
import { requestCheckNow, requestDebugFetch } from '../background/background-messages';
import type { MonitoringRepository } from '../../features/monitoring/repository';
import type { AdminMessage } from '../../shared/storage/modules/admin-message-storage';
import {
    t,
    getLanguage,
    setLanguage,
    getDirection,
    formatDate,
    type AppLanguage,
} from '../../shared/i18n';

const POPUP_REFRESH_INTERVAL_MS = 30_000;

interface AdminMessageDeps {
    getAdminMessages(): Promise<AdminMessage[]>;
    markAdminMessagesRead(): Promise<void>;
}

interface LanguageDeps {
    getLanguage(): Promise<AppLanguage>;
    setLanguage(lang: AppLanguage): Promise<AppLanguage>;
}

interface PopupDependencies {
    readonly monitoringRepository: Pick<
        MonitoringRepository,
        'getOverview' | 'getNotificationsEnabled' | 'setNotificationsEnabled'
    >;
    readonly adminMessages: AdminMessageDeps;
    readonly language?: LanguageDeps;
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
        return t('popup.last_check_never');
    }

    const lastCheck = new Date(lastCheckValue);

    if (Number.isNaN(lastCheck.getTime())) {
        return t('popup.last_check_never');
    }

    const diffMinutes = Math.floor((Date.now() - lastCheck.getTime()) / 60000);

    if (diffMinutes < 1) {
        return t('popup.last_check_now');
    }

    if (diffMinutes < 60) {
        return t('popup.last_check_minutes', { count: diffMinutes });
    }

    if (diffMinutes < 1440) {
        return t('popup.last_check_hours', { count: Math.floor(diffMinutes / 60) });
    }

    return t('popup.last_check_date', { date: formatDate(lastCheck) });
}

function updateToggleUi(button: HTMLButtonElement, isEnabled: boolean) {
    if (isEnabled) {
        button.className = 'btn action secondary';
        setButtonContent(button, 'fa-bell', t('popup.notifications_enabled'));
        return;
    }

    button.className = 'btn action toggle-off';
    setButtonContent(button, 'fa-bell-slash', t('popup.notifications_disabled'));
}

function applyPopupTranslations(root: Document = document): void {
    const lang = getLanguage();
    const dir = getDirection();

    if (root.documentElement) {
        root.documentElement.lang = lang;
        root.documentElement.dir = dir;
    }

    const setText = (id: string, text: string) => {
        const el = root.getElementById(id);
        if (el) {
            el.textContent = text;
        }
    };

    setText('popupPageTitle', t('app.title'));
    setText('popupBrandTitle', t('app.name'));
    setText('popupBrandTagline', t('app.tagline'));
    setText('langToggleText', lang === 'ar' ? 'EN' : 'عربي');
    setText('adminMessagesTitle', t('popup.admin_title'));
    setText('adminMessageLinkText', t('popup.admin_details'));
    setText('todayCountLabel', t('popup.today_projects'));
    setText('totalSeenLabel', t('popup.total_monitored'));
    setText('openDashboardBtnText', t('popup.open_dashboard'));
    setText('checkNowBtnText', t('popup.check_now'));
    setText('checkConnectionBtnText', t('popup.check_connection'));
    setText('footerMostaqlLink', t('popup.marketplaces.mostaql'));
    setText('footerKhamsatLink', t('popup.marketplaces.khamsat'));
    setText('footerNafezlyLink', t('popup.marketplaces.nafezly'));

    const dismissBtn = root.getElementById('dismissAdminMessageBtn');
    if (dismissBtn) {
        dismissBtn.setAttribute('aria-label', t('popup.admin_dismiss'));
    }

    const statsPanel = root.getElementById('statsPanelSection');
    if (statsPanel) {
        statsPanel.setAttribute('aria-label', t('popup.total_monitored'));
    }

    const mainActions = root.getElementById('mainActionsSection');
    if (mainActions) {
        mainActions.setAttribute('aria-label', t('dashboard.nav.overview'));
    }
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

function isSafeHttpUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
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

    const latest = unread[0];

    if (!latest) {
        banner.classList.add('hidden');
        return;
    }

    textEl.textContent = latest.message;

    if (linkEl) {
        if (latest.url && isSafeHttpUrl(latest.url)) {
            linkEl.href = latest.url;
            linkEl.classList.remove('hidden');
        } else {
            linkEl.removeAttribute('href');
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
    let storageChangeListener: Parameters<typeof browser.storage.onChanged.addListener>[0] | null =
        null;

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
        setButtonContent(button, 'fa-sync-alt', t('popup.checking'));
        hidePopupStatus();

        try {
            const result = await requestCheckNow();
            await loadStats(deps);

            if (result.kind === 'failed') {
                const errors = Object.values(result.monitoringErrors)
                    .map((error) => error.message)
                    .filter(Boolean)
                    .join(' | ');

                showPopupStatus(
                    'error',
                    errors ? t('popup.check_failed', { errors }) : t('popup.check_failed_all')
                );
                return;
            }

            showPopupStatus('success', t('popup.check_success'));
        } catch (error) {
            console.error('Error checking now:', error);
            showPopupStatus('error', t('popup.check_failed_generic'));
        } finally {
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
            button.classList.remove('is-loading');
            setButtonContent(button, 'fa-sync-alt', t('popup.check_now'));
        }
    }

    async function handleDiagnostics(button: HTMLButtonElement, report: HTMLElement) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        setButtonContent(button, 'fa-plug', t('popup.checking_connection'));
        report.className = 'connection-report hidden';

        try {
            const response = await requestDebugFetch();

            report.classList.remove('hidden');

            if (response.success) {
                report.className = 'connection-report success';
                report.textContent = t('popup.diagnostics_success', {
                    bytes: response.length ?? 0,
                });
            } else {
                report.className = 'connection-report error';
                report.textContent = t('popup.diagnostics_failed', {
                    error: response.error ?? t('common.unknown_error'),
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : t('common.unknown_error');
            report.className = 'connection-report error';
            report.classList.remove('hidden');
            report.textContent = t('popup.diagnostics_failed', { error: message });
        } finally {
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
            setButtonContent(button, 'fa-plug', t('popup.check_connection'));
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
            showPopupStatus(
                'success',
                newState ? t('popup.notifications_on_toast') : t('popup.notifications_off_toast')
            );
        } catch (error) {
            console.error('Error toggling notifications:', error);
            showPopupStatus('error', t('popup.notifications_error'));
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

        getElement<HTMLButtonElement>('langToggleBtn')?.addEventListener('click', () => {
            void (async () => {
                const nextLang = getLanguage() === 'ar' ? 'en' : 'ar';
                setLanguage(nextLang);
                if (deps.language) {
                    await deps.language.setLanguage(nextLang);
                }
                applyPopupTranslations(document);
                await syncNotificationToggle(deps);
                await loadStats(deps);
            })();
        });
    }

    async function init() {
        if (deps.language) {
            try {
                const storedLang = await deps.language.getLanguage();
                setLanguage(storedLang);
            } catch (err) {
                console.warn('[popup] failed to load language:', err);
            }
        }
        applyPopupTranslations(document);
        bindEvents();
        await Promise.all([loadStats(deps), syncNotificationToggle(deps), loadAdminMessages()]);

        refreshTimer = window.setInterval(() => {
            void loadStats(deps);
        }, POPUP_REFRESH_INTERVAL_MS);

        // Re-render banner in real-time if a message arrives while popup is open
        const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
            changes,
            areaName
        ) => {
            if ((!areaName || areaName === 'local') && (!changes || 'adminMessages' in changes)) {
                void loadAdminMessages();
            }
        };
        storageChangeListener = listener;
        const storageOnChanged = browser.storage?.onChanged ?? browser.storage?.local?.onChanged;
        storageOnChanged?.addListener(listener);
    }

    function destroy() {
        if (refreshTimer !== null) {
            window.clearInterval(refreshTimer);
            refreshTimer = null;
        }

        if (storageChangeListener) {
            const storageOnChanged =
                browser.storage?.onChanged ?? browser.storage?.local?.onChanged;
            storageOnChanged?.removeListener(storageChangeListener);
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

    const cleanup = () => {
        controller.destroy();
    };

    root.defaultView?.addEventListener('pagehide', cleanup, { once: true });
    root.defaultView?.addEventListener('beforeunload', cleanup, { once: true });
}
