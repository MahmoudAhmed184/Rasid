import { resolvePlatformUrl } from '../../../entities/platform/url';
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
    const clearfix = document.createElement('div');
    const actions = document.createElement('div');
    const analyticsButton = document.createElement('button');
    const analyticsIcon = document.createElement('i');
    const monitoredButton = document.createElement('button');
    const monitoredIcon = document.createElement('i');

    box.id = 'mostaql-msg-tools';
    panel.className = 'panel panel-default';
    panel.style.margin = '0 0 10px 0';

    header.className = 'heada';

    title.className = 'heada__title pull-right vcenter';
    title.style.fontSize = '13px';
    titleIcon.className = 'fa fa-fw fa-plug';
    titleIcon.style.color = '#2386c8';
    title.append(titleIcon, ' أدوات فرلانسيا');

    clearfix.className = 'clearfix';

    actions.style.padding = '10px 15px 12px';
    actions.style.display = 'flex';
    actions.style.gap = '8px';

    analyticsButton.id = 'rasid-show-analytics-btn';
    analyticsButton.className = 'btn btn-sm btn-primary';
    analyticsButton.style.flex = '1';
    analyticsIcon.className = 'fa fa-bar-chart';
    analyticsButton.append(analyticsIcon, ' التحليلات');

    monitoredButton.id = 'rasid-show-monitored-btn';
    monitoredButton.className = 'btn btn-sm btn-default';
    monitoredButton.style.flex = '1';
    monitoredIcon.className = 'fa fa-eye';
    monitoredButton.append(monitoredIcon, ' المراقَبة');

    actions.append(analyticsButton, monitoredButton);
    header.append(title, clearfix);
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

    return () => {
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
    modal.style.cssText = `
        display: none; position: fixed; top: 0; left: 0;
        width: 100%; height: 100%; z-index: 99999;
        background: rgba(0,0,0,0.55); overflow-y: auto;
    `;

    card.style.background = '#fff';
    card.style.maxWidth = '980px';
    card.style.margin = '40px auto';
    card.style.borderRadius = '8px';
    card.style.padding = '28px';
    card.style.position = 'relative';
    card.style.direction = 'rtl';
    card.style.boxShadow = '0 8px 40px rgba(0,0,0,0.18)';

    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '20px';
    header.style.borderBottom = '1px solid #eee';
    header.style.paddingBottom = '14px';

    title.style.margin = '0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    titleIcon.className = 'fa fa-bar-chart';
    titleIcon.style.color = '#2386c8';
    titleIcon.style.marginLeft = '8px';
    title.append(titleIcon, ' تحليلات العروض');

    closeButton.id = 'rasid-analytics-close';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = '#888';
    closeButton.style.lineHeight = '1';
    closeButton.style.padding = '0 4px';
    closeButton.textContent = '×';

    modalBody.id = 'rasid-analytics-modal-body';

    loading.style.textAlign = 'center';
    loading.style.padding = '50px';
    loading.style.color = '#999';
    loadingIcon.className = 'fa fa-spinner fa-spin fa-2x';
    loadingText.style.marginTop = '14px';
    loadingText.style.fontSize = '15px';
    loadingText.textContent = 'جاري تحميل التحليلات...';
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
        _loadBidStats();
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
    modal.style.cssText = `
        display: none; position: fixed; top: 0; left: 0;
        width: 100%; height: 100%; z-index: 99999;
        background: rgba(0,0,0,0.55); overflow-y: auto;
    `;

    card.style.background = '#fff';
    card.style.maxWidth = '780px';
    card.style.margin = '40px auto';
    card.style.borderRadius = '8px';
    card.style.padding = '28px';
    card.style.position = 'relative';
    card.style.direction = 'rtl';
    card.style.boxShadow = '0 8px 40px rgba(0,0,0,0.18)';

    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '20px';
    header.style.borderBottom = '1px solid #eee';
    header.style.paddingBottom = '14px';

    title.style.margin = '0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    titleIcon.className = 'fa fa-fw fa-eye';
    titleIcon.style.color = '#2386c8';
    titleIcon.style.marginLeft = '8px';
    title.append(titleIcon, ' المشاريع المراقبة');

    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.alignItems = 'center';

    refreshButton.id = 'rasid-monitored-refresh';
    refreshButton.className = 'btn btn-xs btn-default';
    refreshIcon.className = 'fa fa-refresh';
    refreshButton.append(refreshIcon, ' تحديث');

    closeButton.id = 'rasid-monitored-close';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = '#888';
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

    wrapper.className = 'list-group-item';
    wrapper.style.padding = '30px';
    wrapper.style.textAlign = 'center';
    wrapper.style.color = '#888';
    wrapper.style.border = 'none';
    wrapper.append('لا توجد مشاريع مراقبة. افتح أي مشروع واضغط ');
    emphasis.textContent = 'مراقبة';
    wrapper.append(emphasis, ' لإضافته.');

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

function _createMonitoredProjectItem(job: TrackedProjectRecord): HTMLDivElement {
    const poster = job.clientName || '';
    const timeAgo = job.publishDate || '';
    const bidsText = job.communications ? `${job.communications} تواصل` : '';
    const budget = job.budget && job.budget !== 'غير محدد' ? job.budget : '';
    const status = job.status || 'مفتوح';
    let statusCls = 'label-prj-open';

    if (status.includes('تنفيذ') || status.includes('جارٍ')) {
        statusCls = 'label-prj-processing';
    }
    if (status.includes('مغلق') || status.includes('مكتمل') || status.includes('ملغى')) {
        statusCls = 'label-prj-closed';
    }

    const item = document.createElement('div');
    item.className = 'list-group-item brd--b mrg--an';

    const title = document.createElement('h5');
    title.className = 'listing__title project__title mrg--bt-reset';

    const link = document.createElement('a');
    const jobUrl = resolveMostaqlProjectUrl(job.url);
    if (jobUrl) {
        link.href = jobUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    }
    link.textContent = job.title || 'بدون عنوان';

    const badge = document.createElement('span');
    badge.className = `label ${statusCls}`;
    badge.style.fontSize = '10px';
    badge.style.marginRight = '6px';
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
    countLabel.textContent = `${count} ${label}`;

    const percentLabel = document.createElement('div');
    percentLabel.className = 'pull-left';
    percentLabel.textContent = `${percentage}%`;

    clearfix.append(countLabel, percentLabel);

    const progress = document.createElement('div');
    progress.className = 'progress progress--slim';

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
    projectsProgress.title = `تاريخ التقديم: ${appliedAtStr}`;

    const clearfix = document.createElement('div');
    clearfix.className = 'clearfix';

    const title = document.createElement('div');
    title.className = 'pull-right';
    title.style.maxWidth = '65%';
    title.style.overflow = 'hidden';
    title.style.textOverflow = 'ellipsis';
    title.style.whiteSpace = 'nowrap';
    title.textContent = bid.title || 'عرض';

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
            label: 'مكتملة',
            cssClass: 'label-prj-completed',
            href: `${BIDS_URL}?status=completed`,
        },
        مستبعد: { label: 'مستبعدة', cssClass: 'label-prj-lost', href: BIDS_URL },
        مُغلق: { label: 'مُغلق', cssClass: 'label-prj-closed', href: BIDS_URL },
        'بانتظار الموافقة': {
            label: 'بانتظار الموافقة',
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
        title: 'إجمالي العروض',
        summaryBar: _createBidStatsBar({
            label: 'إجمالي العروض',
            count: overall.total,
            pct: 100,
            href: BIDS_URL,
        }),
        bars: buildBars(['مكتمل', 'مستبعد', 'مُغلق'], overall.byStatus, overall.total),
    });

    const last30Column = _createBidStatsColumn({
        icon: 'fa-calendar',
        title: 'آخر 30 يوم',
        summaryBar: _createBidStatsBar({
            label: 'آخر 30 يوم (إجمالي)',
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
        title: 'اليوم',
        summaryBar: _createBidStatsBar({
            label: 'اليوم (إجمالي)',
            count: last1Day.total,
            pct: pct(last1Day.total, overall.total),
            cssClass: 'label-prj-processing',
            href: BIDS_URL,
        }),
        bars: buildBars(todayKeys, last1Day.byStatus, last1Day.total),
        emptyMsg: 'لا توجد عروض اليوم',
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
                title: 'حالة العروض اليومية',
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
                el.textContent = 'متاح الآن!';
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
