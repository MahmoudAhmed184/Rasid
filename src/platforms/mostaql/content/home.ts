import { resolvePlatformUrl } from '../../../entities/platform/url';
import { getDirection, getLanguage, t, onLanguageChange } from '../../../shared/i18n';
import type {
    PlatformContentServices,
    PlatformDisposer,
    TrackedProjectRecord,
} from '../../contracts';
import { loadMostaqlBidStatusStats, type MostaqlBidStatusStats } from '../bid-tracker';
import { MOSTAQL_SELECTORS } from '../selectors';

// ==========================================
// mostaql/home.js — Homepage injectors (bid stats + monitored panel)
// ==========================================

declare global {
    interface Window {
        _rasidStatsLoaded?: boolean;
        rasidCountdownsInterval?: ReturnType<typeof setInterval>;
    }
}

const MOSTAQL_HOSTS = ['mostaql.com'] as const;
const MOSTAQL_BASE_URL = 'https://mostaql.com/';
const MOSTAQL_PROJECT_PATH_PATTERN = /^\/projects?\/\d+(?:[-/]|$)/;

type TrackingServices = PlatformContentServices['tracking'];

function resolveMostaqlUrl(value: string | null | undefined): string | null {
    return resolvePlatformUrl(value, {
        baseUrl: window.location.href || MOSTAQL_BASE_URL,
        allowedHosts: MOSTAQL_HOSTS,
    });
}

function resolveMostaqlProjectUrl(value: string | null | undefined): string | null {
    return resolvePlatformUrl(value, {
        baseUrl: window.location.href || MOSTAQL_BASE_URL,
        allowedHosts: MOSTAQL_HOSTS,
        pathPattern: MOSTAQL_PROJECT_PATH_PATTERN,
    });
}

function _createRadarIcon(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const outerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    outerCircle.setAttribute('cx', '12');
    outerCircle.setAttribute('cy', '12');
    outerCircle.setAttribute('r', '8');

    const lineV1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineV1.setAttribute('x1', '12');
    lineV1.setAttribute('y1', '2');
    lineV1.setAttribute('x2', '12');
    lineV1.setAttribute('y2', '5');

    const lineV2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineV2.setAttribute('x1', '12');
    lineV2.setAttribute('y1', '19');
    lineV2.setAttribute('x2', '12');
    lineV2.setAttribute('y2', '22');

    const lineH1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineH1.setAttribute('x1', '2');
    lineH1.setAttribute('y1', '12');
    lineH1.setAttribute('x2', '5');
    lineH1.setAttribute('y2', '12');

    const lineH2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineH2.setAttribute('x1', '19');
    lineH2.setAttribute('y1', '12');
    lineH2.setAttribute('x2', '22');
    lineH2.setAttribute('y2', '12');

    const centerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerDot.setAttribute('cx', '12');
    centerDot.setAttribute('cy', '12');
    centerDot.setAttribute('r', '1.75');
    centerDot.setAttribute('fill', 'currentColor');

    svg.append(outerCircle, lineV1, lineV2, lineH1, lineH2, centerDot);
    return svg;
}

export function injectDashboardStats(tracking: TrackingServices): PlatformDisposer | undefined {
    const target = document.querySelector<HTMLElement>(MOSTAQL_SELECTORS.home.target);
    if (!target) {
        return undefined;
    }

    if (document.getElementById('mostaql-msg-tools')) {
        return undefined;
    }

    const box = document.createElement('div');
    const panel = document.createElement('div');
    const header = document.createElement('div');
    const title = document.createElement('h2');
    const titleIcon = document.createElement('i');
    const actions = document.createElement('div');
    const analyticsButton = document.createElement('button');
    const analyticsIcon = document.createElement('i');
    const monitoredButton = document.createElement('button');
    const monitoredIcon = document.createElement('i');

    box.id = 'mostaql-msg-tools';
    box.dir = getDirection();
    box.lang = getLanguage();
    panel.className = 'panel panel-default rasid-tools-panel';
    panel.style.margin = '0 0 16px 0';
    panel.style.borderRadius = '8px';
    panel.style.overflow = 'hidden';
    panel.style.border = '1px solid var(--rasid-border, rgba(0, 0, 0, 0.08))';
    panel.style.background = 'var(--rasid-bg-card, #fff)';
    panel.style.boxShadow = 'var(--rasid-card-shadow, 0 1px 3px rgba(0, 0, 0, 0.05))';

    header.className = 'heada rasid-tools-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '12px 16px';
    header.style.borderBottom = '1px solid var(--rasid-border-subtle, rgba(0, 0, 0, 0.05))';
    header.style.background = 'transparent';

    title.className = 'rasid-tools-title';
    title.style.margin = '0';
    title.style.fontSize = '15px';
    title.style.fontWeight = '600';
    title.style.display = 'flex';
    title.style.alignItems = 'center';
    title.style.color = 'var(--rasid-text-primary, inherit)';
    title.style.lineHeight = '1.4';

    titleIcon.className = 'fa fa-crosshairs rasid-tools-icon';
    titleIcon.setAttribute('aria-hidden', 'true');
    titleIcon.replaceChildren(_createRadarIcon());
    titleIcon.style.color = 'var(--rasid-primary, #2386c8)';
    titleIcon.style.marginInlineEnd = '8px';
    titleIcon.style.display = 'inline-flex';
    titleIcon.style.alignItems = 'center';
    titleIcon.style.justifyContent = 'center';

    const updateLabels = () => {
        box.dir = getDirection();
        box.lang = getLanguage();
        title.replaceChildren(titleIcon, document.createTextNode(` ${t('content.mostaql.tools')}`));
        analyticsButton.textContent = '';
        analyticsButton.append(analyticsIcon, ` ${t('content.mostaql.analytics')}`);
        monitoredButton.textContent = '';
        monitoredButton.append(monitoredIcon, ` ${t('content.mostaql.monitored')}`);
    };

    updateLabels();

    actions.className = 'rasid-tools-actions';
    actions.style.padding = '12px 16px';
    actions.style.display = 'flex';
    actions.style.gap = '8px';

    analyticsButton.id = 'rasid-show-analytics-btn';
    analyticsButton.className = 'btn btn-sm rasid-tools-btn';
    analyticsButton.style.flex = '1';
    analyticsIcon.className = 'fa fa-bar-chart';

    monitoredButton.id = 'rasid-show-monitored-btn';
    monitoredButton.className = 'btn btn-sm rasid-tools-btn';
    monitoredButton.style.flex = '1';
    monitoredIcon.className = 'fa fa-eye';

    actions.append(analyticsButton, monitoredButton);
    header.append(title);
    panel.append(header, actions);
    box.appendChild(panel);
    target.prepend(box);

    MOSTAQL_SELECTORS.home.disabledBidLinks.forEach((href) => {
        document.querySelectorAll<HTMLElement>(`a[href="${href}"]`).forEach((el) => {
            el.removeAttribute('href');
            el.style.cursor = 'default';
            el.style.pointerEvents = 'none';
        });
    });

    MOSTAQL_SELECTORS.home.hiddenProgressLabels.forEach((cls) => {
        document.querySelectorAll<HTMLElement>(cls).forEach((bar) => {
            const wrapper = bar.closest('.progress__bar');
            if (wrapper) {
                wrapper.remove();
            }
        });
    });

    _injectAnalyticsModal();
    _injectMonitoredModal(tracking);

    analyticsButton?.addEventListener('click', _openAnalyticsModal);
    monitoredButton?.addEventListener('click', () => {
        _openMonitoredModal(tracking);
    });

    const unsubscribeLang = onLanguageChange(() => {
        updateLabels();
        document.getElementById('rasid-analytics-modal')?.remove();
        document.getElementById('rasid-monitored-modal')?.remove();
        _injectAnalyticsModal();
        _injectMonitoredModal(tracking);
    });

    return () => {
        unsubscribeLang();
        _stopSlotCountdowns();
        window._rasidStatsLoaded = false;
        box.remove();
        document.getElementById('rasid-analytics-modal')?.remove();
        document.getElementById('rasid-monitored-modal')?.remove();
    };
}

function _injectAnalyticsModal() {
    if (document.getElementById('rasid-analytics-modal')) {
        return;
    }

    const modal = document.createElement('div');
    const card = document.createElement('div');
    const header = document.createElement('div');
    const title = document.createElement('h3');
    const titleIcon = document.createElement('i');
    const closeButton = document.createElement('button');
    const modalBody = document.createElement('div');
    const loading = document.createElement('div');
    const loadingIcon = document.createElement('i');
    const loadingText = document.createElement('p');

    modal.id = 'rasid-analytics-modal';
    modal.className = 'rasid-modal';
    modal.style.cssText = `
        display: none; position: fixed; top: 0; left: 0;
        width: 100%; height: 100%; z-index: 99999;
        background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
        overflow-y: auto;
    `;

    card.className = 'rasid-modal-card';
    card.style.background = 'var(--rasid-bg-modal, #fff)';
    card.style.color = 'var(--rasid-text-primary, #222)';
    card.style.border = '1px solid var(--rasid-border, #e5e5e5)';
    card.style.maxWidth = '980px';
    card.style.margin = '40px auto';
    card.style.borderRadius = '12px';
    card.style.padding = '24px';
    card.style.position = 'relative';
    card.style.direction = getDirection();
    card.lang = getLanguage();
    card.style.boxShadow = 'var(--rasid-modal-shadow, 0 16px 40px rgba(0,0,0,0.15))';

    header.className = 'rasid-modal-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '20px';
    header.style.borderBottom = '1px solid var(--rasid-border-subtle, #eee)';
    header.style.paddingBottom = '16px';

    title.style.margin = '0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.color = 'var(--rasid-text-primary, inherit)';
    titleIcon.className = 'fa fa-bar-chart';
    titleIcon.style.color = 'var(--rasid-primary, #2386c8)';
    titleIcon.style.marginInlineEnd = '8px';
    title.append(titleIcon, ` ${t('content.mostaql.analytics_title')}`);

    closeButton.id = 'rasid-analytics-close';
    closeButton.className = 'rasid-modal-close';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = 'var(--rasid-text-muted, #888)';
    closeButton.style.lineHeight = '1';
    closeButton.style.padding = '0 4px';
    closeButton.textContent = '×';

    modalBody.id = 'rasid-analytics-modal-body';

    loading.className = 'rasid-modal-loading';
    loading.style.textAlign = 'center';
    loading.style.padding = '50px';
    loading.style.color = 'var(--rasid-text-muted, #999)';
    loadingIcon.className = 'fa fa-spinner fa-spin fa-2x';
    loadingText.style.marginTop = '14px';
    loadingText.style.fontSize = '15px';
    loadingText.textContent = t('content.mostaql.analytics_loading');
    loading.append(loadingIcon, loadingText);

    modalBody.appendChild(loading);
    header.append(title, closeButton);
    card.append(header, modalBody);
    modal.appendChild(card);
    document.body.appendChild(modal);

    closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

function _openAnalyticsModal() {
    const modal = document.getElementById('rasid-analytics-modal');
    if (!modal) {
        return;
    }
    modal.style.display = 'block';

    if (!window._rasidStatsLoaded) {
        window._rasidStatsLoaded = true;
        void _loadBidStats();
    }
}

function _injectMonitoredModal(tracking: TrackingServices) {
    if (document.getElementById('rasid-monitored-modal')) {
        return;
    }

    const modal = document.createElement('div');
    const card = document.createElement('div');
    const header = document.createElement('div');
    const title = document.createElement('h3');
    const titleIcon = document.createElement('i');
    const actions = document.createElement('div');
    const refreshButton = document.createElement('button');
    const refreshIcon = document.createElement('i');
    const closeButton = document.createElement('button');
    const modalBody = document.createElement('div');
    const loading = document.createElement('div');
    const loadingIcon = document.createElement('i');

    modal.id = 'rasid-monitored-modal';
    modal.className = 'rasid-modal';
    modal.style.cssText = `
        display: none; position: fixed; top: 0; left: 0;
        width: 100%; height: 100%; z-index: 99999;
        background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
        overflow-y: auto;
    `;

    card.className = 'rasid-modal-card';
    card.style.background = 'var(--rasid-bg-modal, #fff)';
    card.style.color = 'var(--rasid-text-primary, #222)';
    card.style.border = '1px solid var(--rasid-border, #e5e5e5)';
    card.style.maxWidth = '780px';
    card.style.margin = '40px auto';
    card.style.borderRadius = '12px';
    card.style.padding = '24px';
    card.style.position = 'relative';
    card.style.direction = getDirection();
    card.lang = getLanguage();
    card.style.boxShadow = 'var(--rasid-modal-shadow, 0 16px 40px rgba(0,0,0,0.15))';

    header.className = 'rasid-modal-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '20px';
    header.style.borderBottom = '1px solid var(--rasid-border-subtle, #eee)';
    header.style.paddingBottom = '16px';

    title.style.margin = '0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.color = 'var(--rasid-text-primary, inherit)';
    titleIcon.className = 'fa fa-fw fa-eye';
    titleIcon.style.color = 'var(--rasid-primary, #2386c8)';
    titleIcon.style.marginInlineEnd = '8px';
    title.append(titleIcon, ` ${t('content.mostaql.monitored_title')}`);

    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.alignItems = 'center';

    refreshButton.id = 'rasid-monitored-refresh';
    refreshButton.className = 'btn btn-xs btn-default rasid-refresh-btn';
    refreshButton.style.background = 'var(--rasid-btn-bg, #f5f5f5)';
    refreshButton.style.color = 'var(--rasid-btn-color, #333)';
    refreshButton.style.border = '1px solid var(--rasid-btn-border, #d5d5d5)';
    refreshButton.style.borderRadius = '6px';
    refreshButton.style.padding = '4px 12px';
    refreshIcon.className = 'fa fa-refresh';
    refreshButton.append(refreshIcon, ` ${t('bids.refresh')}`);

    closeButton.id = 'rasid-monitored-close';
    closeButton.className = 'rasid-modal-close';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = 'var(--rasid-text-muted, #888)';
    closeButton.style.lineHeight = '1';
    closeButton.style.padding = '0 4px';
    closeButton.textContent = '×';

    modalBody.id = 'rasid-monitored-modal-body';

    loading.style.textAlign = 'center';
    loading.style.padding = '50px';
    loading.style.color = '#999';
    loadingIcon.className = 'fa fa-spinner fa-spin fa-2x';
    loading.appendChild(loadingIcon);

    modalBody.appendChild(loading);
    actions.append(refreshButton, closeButton);
    header.append(title, actions);
    card.append(header, modalBody);
    modal.appendChild(card);
    document.body.appendChild(modal);

    closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    refreshButton.addEventListener('click', () => {
        void _loadMonitoredData(tracking);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

function _openMonitoredModal(tracking: TrackingServices) {
    const modal = document.getElementById('rasid-monitored-modal');
    if (!modal) {
        return;
    }
    modal.style.display = 'block';
    void _loadMonitoredData(tracking);
}

function _createMonitoredLoadingState(): HTMLDivElement {
    const wrapper = document.createElement('div');
    const icon = document.createElement('i');

    wrapper.style.textAlign = 'center';
    wrapper.style.padding = '40px';
    wrapper.style.color = '#999';

    icon.className = 'fa fa-spinner fa-spin fa-2x';
    wrapper.appendChild(icon);

    return wrapper;
}

function _createMonitoredEmptyState(): HTMLDivElement {
    const wrapper = document.createElement('div');
    const emphasis = document.createElement('strong');

    wrapper.className = 'list-group-item rasid-monitored-empty';
    wrapper.style.padding = '36px 20px';
    wrapper.style.textAlign = 'center';
    wrapper.style.color = 'var(--rasid-text-muted, #888)';
    wrapper.style.border = 'none';
    wrapper.style.background = 'transparent';
    wrapper.append(t('content.mostaql.no_monitored_prefix'));
    emphasis.textContent = t('content.mostaql.track');
    emphasis.style.color = 'var(--rasid-primary, #2386c8)';
    wrapper.append(emphasis, t('content.mostaql.no_monitored_suffix'));

    return wrapper;
}

function _createMonitoredMetaItem(iconClassName: string, text: string): HTMLLIElement {
    const item = document.createElement('li');
    const span = document.createElement('span');
    const icon = document.createElement('i');

    span.className = 'text-muted';
    icon.className = iconClassName;
    span.append(icon, ` ${text}`);
    item.appendChild(span);

    return item;
}

function formatLocalizedProjectStatus(status: string | undefined): string {
    if (!status) {
        return t('common.open');
    }
    if (getLanguage() === 'ar') {
        return status;
    }
    if (
        status.includes('تنفيذ') ||
        status.includes('جارٍ') ||
        status.toLowerCase().includes('progress')
    ) {
        return t('common.in_progress');
    }
    if (status.includes('مكتمل') || status.toLowerCase().includes('completed')) {
        return t('common.completed');
    }
    if (status.includes('مغلق') || status.toLowerCase().includes('closed')) {
        return t('common.closed');
    }
    if (status.includes('ملغى') || status.toLowerCase().includes('cancel')) {
        return t('common.cancelled');
    }
    return status;
}

function _createMonitoredProjectItem(job: TrackedProjectRecord): HTMLDivElement {
    const poster = job.clientName || '';
    const timeAgo = job.publishDate || '';
    const bidsText = job.communications
        ? t('overview.communications', { count: job.communications })
        : '';
    const notSpecified = t('common.not_specified');
    const budget =
        job.budget && job.budget !== 'غير محدد' && job.budget !== notSpecified ? job.budget : '';
    const status = formatLocalizedProjectStatus(job.status);
    let statusCls = 'label-prj-open';

    if (
        status.includes('تنفيذ') ||
        status.includes('جارٍ') ||
        status.toLowerCase().includes('progress')
    ) {
        statusCls = 'label-prj-processing';
    }
    if (
        status.includes('مغلق') ||
        status.includes('مكتمل') ||
        status.includes('ملغى') ||
        status.toLowerCase().includes('closed') ||
        status.toLowerCase().includes('completed')
    ) {
        statusCls = 'label-prj-closed';
    }

    const item = document.createElement('div');
    item.className = 'list-group-item brd--b mrg--an rasid-monitored-item';
    item.style.background = 'transparent';
    item.style.borderColor = 'var(--rasid-border-subtle, #eee)';

    const title = document.createElement('h5');
    title.className = 'listing__title project__title mrg--bt-reset';

    const link = document.createElement('a');
    const jobUrl = resolveMostaqlProjectUrl(job.url);
    if (jobUrl) {
        link.href = jobUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    }
    link.style.color = 'var(--rasid-text-primary, inherit)';
    link.textContent = job.title || t('common.untitled');

    const badge = document.createElement('span');
    badge.className = `label ${statusCls}`;
    badge.style.fontSize = '10px';
    badge.style.marginInlineEnd = '6px';
    badge.textContent = status;

    title.append(link, badge);
    item.appendChild(title);

    const metaEntries = [
        poster ? _createMonitoredMetaItem('fa fa-fw fa-user', poster) : null,
        timeAgo ? _createMonitoredMetaItem('fa fa-fw fa-clock-o', timeAgo) : null,
        bidsText ? _createMonitoredMetaItem('fa fa-fw fa-handshake-o', bidsText) : null,
        budget ? _createMonitoredMetaItem('fa fa-fw fa-money', budget) : null,
    ].filter((entry): entry is HTMLLIElement => entry !== null);

    if (metaEntries.length > 0) {
        const metaList = document.createElement('ul');
        metaList.className = 'project__meta list-meta text-zeta clr-gray-dark';
        metaList.append(...metaEntries);
        item.appendChild(metaList);
    }

    return item;
}

async function _loadMonitoredData(tracking: TrackingServices) {
    const listEl = document.getElementById('rasid-monitored-modal-body');
    if (!listEl) {
        return;
    }

    listEl.replaceChildren(_createMonitoredLoadingState());

    const jobs = [...(await tracking.list())].sort((a, b) =>
        (b.lastChecked || '').localeCompare(a.lastChecked || '')
    );

    if (jobs.length === 0) {
        listEl.replaceChildren(_createMonitoredEmptyState());
        return;
    }

    const panelListing = document.createElement('div');
    panelListing.className = 'panel-listing';
    panelListing.append(...jobs.map((job) => _createMonitoredProjectItem(job)));
    listEl.replaceChildren(panelListing);
}

function _createBidStatsBar(config: {
    label: string;
    count: number;
    pct: number;
    cssClass?: string;
    href?: string;
    isLink?: boolean;
}): HTMLElement {
    const {
        label,
        count,
        pct: percentage,
        cssClass = '',
        href = 'https://mostaql.com/dashboard/bids',
        isLink = true,
    } = config;
    const wrapper = document.createElement(isLink ? 'a' : 'span');

    if (wrapper instanceof HTMLAnchorElement) {
        const safeHref = resolveMostaqlUrl(href);
        if (safeHref) {
            wrapper.href = safeHref;
        }
    }

    wrapper.className = 'progress__bar docs-creator';

    const projectsProgress = document.createElement('div');
    projectsProgress.className = 'projects-progress';

    const clearfix = document.createElement('div');
    clearfix.className = 'clearfix';

    const countLabel = document.createElement('div');
    countLabel.className = 'pull-right';
    countLabel.style.color = 'var(--rasid-text-primary, inherit)';
    countLabel.style.fontVariantNumeric = 'tabular-nums';
    countLabel.textContent = `${count} ${label}`;

    const percentLabel = document.createElement('div');
    percentLabel.className = 'pull-left';
    percentLabel.style.color = 'var(--rasid-text-muted, inherit)';
    percentLabel.style.fontVariantNumeric = 'tabular-nums';
    percentLabel.textContent = `${percentage}%`;

    clearfix.append(countLabel, percentLabel);

    const progress = document.createElement('div');
    progress.className = 'progress progress--slim';
    progress.style.background = 'var(--rasid-progress-bg, #ebebeb)';

    const progressBar = document.createElement('div');
    progressBar.className = `progress-bar ${cssClass}`.trim();
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-valuenow', String(percentage));
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', '100');
    progressBar.style.width = `${percentage}%`;

    const srOnly = document.createElement('span');
    srOnly.className = 'sr-only';
    srOnly.textContent = `${percentage}%`;

    progressBar.appendChild(srOnly);
    progress.appendChild(progressBar);
    projectsProgress.append(clearfix, progress);
    wrapper.appendChild(projectsProgress);

    return wrapper;
}

function _createBidStatsColumn(config: {
    icon: string;
    title: string;
    summaryBar: HTMLElement;
    bars: HTMLElement[];
    emptyMsg?: string;
    hideHeader?: boolean;
}): HTMLDivElement {
    const column = document.createElement('div');
    column.className = 'col-sm-4 progress__bars';

    const header = document.createElement('p');
    header.className = config.hideHeader
        ? 'mostaql-stats-header'
        : 'text-muted mostaql-stats-header';

    if (config.hideHeader) {
        header.style.visibility = 'hidden';
        header.textContent = '-';
    } else {
        const icon = document.createElement('i');
        icon.className = `fa ${config.icon}`;
        header.append(icon, ` ${config.title}`);
    }

    column.append(header, config.summaryBar);

    if (config.bars.length > 0) {
        column.append(...config.bars);
        return column;
    }

    if (config.emptyMsg) {
        const empty = document.createElement('span');
        empty.className = 'text-muted mostaql-stats-empty';
        empty.textContent = config.emptyMsg;
        column.appendChild(empty);
    }

    return column;
}

function _createBidStatsCountdownCard(
    bid: MostaqlBidStatusStats['recent24hBids'][number]
): HTMLAnchorElement {
    const totalMs = 24 * 60 * 60 * 1000;
    const msLeft = totalMs - bid.ageMs;
    const progress = Math.max(0, Math.min(100, Math.round(((totalMs - msLeft) / totalMs) * 100)));
    const appliedAtStr = bid.published.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
    });
    let color = '#dc3545';

    if (progress >= 85) {
        color = '#28a745';
    } else if (progress >= 50) {
        color = '#ffc107';
    } else if (progress >= 25) {
        color = '#17a2b8';
    }

    const link = document.createElement('a');
    const bidUrl = resolveMostaqlProjectUrl(bid.url);
    link.href = bidUrl ?? '#';
    if (bidUrl) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    }
    link.className = 'progress__bar docs-creator';

    const projectsProgress = document.createElement('div');
    projectsProgress.className = 'projects-progress';
    projectsProgress.title = t('content.mostaql.applied_date', { date: appliedAtStr });

    const clearfix = document.createElement('div');
    clearfix.className = 'clearfix';

    const title = document.createElement('div');
    title.className = 'pull-right';
    title.style.maxWidth = '65%';
    title.style.overflow = 'hidden';
    title.style.textOverflow = 'ellipsis';
    title.style.whiteSpace = 'nowrap';
    title.style.color = 'var(--rasid-text-primary, inherit)';
    title.textContent = bid.title || t('bids.untitled_bid');

    const countdown = document.createElement('div');
    countdown.className = 'pull-left rasid-countdown';
    countdown.dataset.msLeft = String(msLeft);
    countdown.style.color = color;
    countdown.style.fontFamily = 'monospace';
    countdown.style.fontWeight = 'bold';
    countdown.style.letterSpacing = '0.5px';
    countdown.style.direction = 'ltr';
    countdown.textContent = '--:--:--';

    clearfix.append(title, countdown);

    const progressWrapper = document.createElement('div');
    progressWrapper.className = 'progress progress--slim';
    progressWrapper.style.background = 'var(--rasid-progress-bg, #ebebeb)';

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar rasid-progress-bar';
    progressBar.setAttribute('role', 'progressbar');
    progressBar.style.width = `${progress}%`;
    progressBar.style.backgroundColor = color;

    progressWrapper.appendChild(progressBar);
    projectsProgress.append(clearfix, progressWrapper);
    link.appendChild(projectsProgress);

    return link;
}

function _renderBidStats(stats: MostaqlBidStatusStats): void {
    const BIDS_URL = 'https://mostaql.com/dashboard/bids';

    const STATUS_CONFIG: Record<string, { label: string; cssClass: string; href: string }> = {
        مكتمل: {
            label: t('bids.status_plural.completed'),
            cssClass: 'label-prj-completed',
            href: `${BIDS_URL}?status=completed`,
        },
        مستبعد: {
            label: t('bids.status_plural.rejected'),
            cssClass: 'label-prj-lost',
            href: BIDS_URL,
        },
        مُغلق: {
            label: t('bids.status_plural.closed'),
            cssClass: 'label-prj-closed',
            href: BIDS_URL,
        },
        'بانتظار الموافقة': {
            label: t('bids.status_plural.pending'),
            cssClass: 'label-prj-open',
            href: `${BIDS_URL}?status=pending`,
        },
    };

    const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
    const buildBars = (keys: string[], byStatus: Record<string, number>, total: number) =>
        keys.map((key) => {
            const cfg = STATUS_CONFIG[key] || { label: key, cssClass: '', href: BIDS_URL };
            const count = byStatus[key] || 0;
            return _createBidStatsBar({
                label: cfg.label,
                count,
                pct: pct(count, total),
                cssClass: cfg.cssClass,
                href: cfg.href,
            });
        });

    const { status: overall, last30Days, last1Day, recent24hBids } = stats;

    const overallColumn = _createBidStatsColumn({
        icon: 'fa-list-ul',
        title: t('content.mostaql.stat_overall'),
        summaryBar: _createBidStatsBar({
            label: t('content.mostaql.stat_overall'),
            count: overall.total,
            pct: 100,
            href: BIDS_URL,
        }),
        bars: buildBars(['مكتمل', 'مستبعد', 'مُغلق'], overall.byStatus, overall.total),
    });

    const last30Column = _createBidStatsColumn({
        icon: 'fa-calendar',
        title: t('content.mostaql.stat_last30'),
        summaryBar: _createBidStatsBar({
            label: `${t('content.mostaql.stat_last30')} (${t('bids.stat.total_30d')})`,
            count: last30Days.total,
            pct: pct(last30Days.total, overall.total),
            cssClass: 'label-prj-open',
            href: BIDS_URL,
        }),
        bars: buildBars(
            ['بانتظار الموافقة', 'مستبعد', 'مُغلق'],
            last30Days.byStatus,
            last30Days.total
        ),
    });

    const todayKeys = Object.keys(last1Day.byStatus);
    const todayColumn = _createBidStatsColumn({
        icon: 'fa-clock-o',
        title: t('content.mostaql.stat_today'),
        summaryBar: _createBidStatsBar({
            label: `${t('content.mostaql.stat_today')} (${t('bids.stat.today_bids')})`,
            count: last1Day.total,
            pct: pct(last1Day.total, overall.total),
            cssClass: 'label-prj-processing',
            href: BIDS_URL,
        }),
        bars: buildBars(todayKeys, last1Day.byStatus, last1Day.total),
        emptyMsg: t('content.mostaql.no_bids_today'),
    });

    let countdownsSection: HTMLDivElement | null = null;
    if (recent24hBids && recent24hBids.length > 0) {
        countdownsSection = document.createElement('div');
        countdownsSection.className = 'row';
        countdownsSection.style.marginTop = '20px';
        const sortedBids = recent24hBids.sort((a, b) => b.ageMs - a.ageMs);
        const numCols = 3;
        const buckets: Array<MostaqlBidStatusStats['recent24hBids']> = Array.from(
            { length: numCols },
            () => []
        );
        sortedBids.forEach((bid, index) => {
            buckets[index % numCols].push(bid);
        });

        for (let i = 0; i < numCols; i++) {
            const chunk = buckets[i];
            const countdownColumn = _createBidStatsColumn({
                icon: 'fa-refresh',
                title: t('content.mostaql.daily_bids_status'),
                summaryBar: document.createElement('span'),
                bars: chunk
                    .filter((bid) => 24 * 60 * 60 * 1000 - bid.ageMs > 0)
                    .map((bid) => _createBidStatsCountdownCard(bid)),
                hideHeader: i !== 0,
            });

            const emptySummary = countdownColumn.querySelector('span');
            if (emptySummary) {
                emptySummary.remove();
            }

            countdownsSection.appendChild(countdownColumn);
        }
    }

    const modalBody = document.getElementById('rasid-analytics-modal-body');
    if (!modalBody) {
        return;
    }

    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '20px';
    row.style.display = 'flex';
    row.style.alignItems = 'flex-start';
    row.append(overallColumn, last30Column, todayColumn);

    if (countdownsSection) {
        const countdownWrapper = document.createElement('div');
        countdownWrapper.appendChild(countdownsSection);
        modalBody.replaceChildren(row, countdownWrapper);
    } else {
        modalBody.replaceChildren(row);
    }

    _startSlotCountdowns();
}

function _startSlotCountdowns() {
    _stopSlotCountdowns();

    const updateTimers = () => {
        const totalMs = 24 * 60 * 60 * 1000;
        document.querySelectorAll<HTMLElement>('.rasid-countdown').forEach((el) => {
            let msLeft = parseInt(el.getAttribute('data-ms-left') ?? '0', 10);
            if (isNaN(msLeft) || msLeft <= 0) {
                el.textContent = t('bids.available_now');
                el.style.color = '#28a745';
                const container = el.closest('.projects-progress');
                if (container) {
                    const bar = container.querySelector<HTMLElement>('.progress-bar');
                    if (bar) {
                        bar.style.width = '100%';
                        bar.style.backgroundColor = '#28a745';
                    }
                }
                return;
            }
            msLeft -= 1000;
            el.setAttribute('data-ms-left', String(msLeft));
            const hours = Math.floor(msLeft / (1000 * 60 * 60));
            const minutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((msLeft % (1000 * 60)) / 1000);
            el.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            const p = Math.max(0, Math.min(100, ((totalMs - msLeft) / totalMs) * 100));
            let color = '#dc3545';
            if (p >= 85) {
                color = '#28a745';
            } else if (p >= 50) {
                color = '#ffc107';
            } else if (p >= 25) {
                color = '#17a2b8';
            }
            el.style.color = color;
            const container = el.closest('.projects-progress');
            if (container) {
                const bar = container.querySelector<HTMLElement>('.progress-bar');
                if (bar) {
                    bar.style.width = `${p}%`;
                    bar.style.backgroundColor = color;
                }
            }
        });
    };

    updateTimers();
    window.rasidCountdownsInterval = setInterval(updateTimers, 1000);
}

function _stopSlotCountdowns(): void {
    if (!window.rasidCountdownsInterval) {
        return;
    }

    clearInterval(window.rasidCountdownsInterval);
    delete window.rasidCountdownsInterval;
}

async function _loadBidStats(): Promise<void> {
    try {
        const stats = await loadMostaqlBidStatusStats();
        _renderBidStats(stats);
    } catch (err) {
        console.error('Error fetching bids:', err);
    }
}

export function injectMonitoredProjects(tracking: TrackingServices): PlatformDisposer | undefined {
    const existingModal = document.getElementById('rasid-monitored-modal');
    _injectMonitoredModal(tracking);

    if (existingModal) {
        return undefined;
    }

    return () => {
        document.getElementById('rasid-monitored-modal')?.remove();
    };
}
