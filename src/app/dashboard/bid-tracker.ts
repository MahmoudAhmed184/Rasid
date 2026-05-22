import {
    loadMostaqlBidTrackerData,
    MOSTAQL_BID_WINDOW_MS,
    type MostaqlBidTrackerStats,
    type MostaqlHomepageBidStats,
    type MostaqlTimelineBid,
} from '../../platforms/mostaql/bid-tracker';

const BID_STATUS_CONFIG = {
    'بانتظار الموافقة': {
        icon: 'fa-clock',
        color: 'var(--warning)',
        bg: 'var(--warning-soft)',
        label: 'بانتظار الموافقة',
    },
    مكتمل: {
        icon: 'fa-check-circle',
        color: 'var(--success)',
        bg: 'var(--success-soft)',
        label: 'مكتملة',
    },
    مستبعد: {
        icon: 'fa-times-circle',
        color: 'var(--danger)',
        bg: 'var(--danger-soft)',
        label: 'مستبعدة',
    },
    مُغلق: {
        icon: 'fa-ban',
        color: 'var(--text-muted)',
        bg: 'var(--surface-muted)',
        label: 'مُغلقة',
    },
} as const;

function createIcon(doc: Document, iconClass: string): HTMLElement {
    const icon = doc.createElement('i');
    icon.className = `fas ${iconClass}`;
    return icon;
}

function createStateMessage(
    doc: Document,
    options: {
        readonly className: string;
        readonly iconClass: string;
        readonly title: string;
        readonly detail?: string;
        readonly action?: HTMLElement;
    }
): HTMLElement {
    const container = doc.createElement('div');
    container.className = options.className;

    const title = doc.createElement('p');
    title.textContent = options.title;

    container.append(createIcon(doc, options.iconClass), title);

    if (options.detail) {
        const detail = doc.createElement('span');
        detail.textContent = options.detail;
        container.appendChild(detail);
    }

    if (options.action) {
        container.appendChild(options.action);
    }

    return container;
}

function createHelpText(doc: Document, message: string): HTMLElement {
    const paragraph = doc.createElement('p');
    paragraph.className = 'help-text empty-state';
    paragraph.textContent = message;
    return paragraph;
}

export function createBidTracker(root: Document) {
    const timelineContainer = root.getElementById('bidsTimelineList');
    const statusGrid = root.getElementById('bidsStatusGrid');
    let isBound = false;
    let isLoaded = false;
    let countdownTimer: number | null = null;

    function resetSummaryCards() {
        [
            'bids-total-30d',
            'bids-available-slots',
            'bids-next-available',
            'bids-today-count',
        ].forEach((id) => {
            const element = root.getElementById(id);
            if (element) {
                element.textContent = '-';
            }
        });
    }

    function showLoadingState() {
        if (!(timelineContainer instanceof HTMLElement)) {
            return;
        }

        timelineContainer.replaceChildren(
            createStateMessage(root, {
                className: 'bids-loading',
                iconClass: 'fa-spinner fa-spin',
                title: 'جاري تحميل بيانات العروض...',
            })
        );

        resetSummaryCards();

        if (statusGrid instanceof HTMLElement) {
            statusGrid.replaceChildren();
        }
    }

    function showErrorState(message: string) {
        if (!(timelineContainer instanceof HTMLElement)) {
            return;
        }

        const retryButton = root.createElement('button');
        retryButton.className = 'btn-secondary btn-retry-bids';
        retryButton.type = 'button';
        retryButton.append(createIcon(root, 'fa-redo'), root.createTextNode(' إعادة المحاولة'));

        timelineContainer.replaceChildren(
            createStateMessage(root, {
                className: 'bids-error',
                iconClass: 'fa-exclamation-triangle',
                title: 'تعذر تحميل بيانات العروض',
                detail: message,
                action: retryButton,
            })
        );
    }

    function getCountdownColor(percentage: number) {
        if (percentage >= 90) {
            return 'var(--success)';
        }
        if (percentage >= 70) {
            return 'var(--primary)';
        }
        if (percentage >= 50) {
            return 'var(--accent)';
        }
        if (percentage >= 30) {
            return 'var(--warning)';
        }
        return 'var(--danger)';
    }

    function formatCountdown(msLeft: number) {
        if (msLeft <= 0) {
            return 'متاح الآن!';
        }

        const totalSeconds = Math.floor(msLeft / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        if (days > 0) {
            return `${days}d ${hours.toString().padStart(2, '0')}h ${minutes
                .toString()
                .padStart(2, '0')}m`;
        }

        const seconds = totalSeconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes
            .toString()
            .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function getStatusCssClass(status: string | null) {
        if (!status) {
            return 'bid-status-pending';
        }
        if (status.includes('مكتمل')) {
            return 'bid-status-completed';
        }
        if (status.includes('مستبعد') || status.includes('مُغلق')) {
            return 'bid-status-rejected';
        }
        if (status.includes('انتظار')) {
            return 'bid-status-pending';
        }
        return 'bid-status-pending';
    }

    function renderSummary(stats: MostaqlBidTrackerStats, homepageStats: MostaqlHomepageBidStats) {
        const totalEl = root.getElementById('bids-total-30d');
        const availableEl = root.getElementById('bids-available-slots');
        const nextEl = root.getElementById('bids-next-available');
        const todayEl = root.getElementById('bids-today-count');

        if (totalEl) {
            totalEl.textContent = String(stats.total30d);
        }
        if (todayEl) {
            todayEl.textContent = String(stats.todayCount);
        }
        if (availableEl) {
            availableEl.textContent = String(homepageStats.available);
        }

        if (nextEl && stats.nextAvailable) {
            const hoursLeft = Math.floor(stats.nextAvailable.msLeft / (1000 * 60 * 60));
            const daysLeft = Math.floor(hoursLeft / 24);
            const remainingHours = hoursLeft % 24;
            nextEl.textContent =
                daysLeft > 0 ? `${daysLeft} يوم ${remainingHours} ساعة` : `${remainingHours} ساعة`;
        } else if (nextEl) {
            nextEl.textContent = 'متاح الآن!';
        }
    }

    function renderStatusCards(byStatus: Record<string, number>, total: number) {
        if (!(statusGrid instanceof HTMLElement)) {
            return;
        }

        const statusKeys = Object.keys(byStatus);

        if (statusKeys.length === 0) {
            statusGrid.replaceChildren(createHelpText(root, 'لا توجد بيانات حالات.'));
            return;
        }

        const fragment = root.createDocumentFragment();

        for (const statusKey of statusKeys) {
            const count = byStatus[statusKey];
            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
            const config = BID_STATUS_CONFIG[statusKey as keyof typeof BID_STATUS_CONFIG] ?? {
                icon: 'fa-question-circle',
                color: 'var(--text-muted)',
                bg: 'var(--surface-muted)',
                label: statusKey,
            };

            const card = root.createElement('div');
            card.className = 'bid-status-card';

            const iconWrap = root.createElement('div');
            iconWrap.className = 'bid-status-icon';
            iconWrap.style.background = config.bg;
            iconWrap.style.color = config.color;
            iconWrap.appendChild(createIcon(root, config.icon));

            const info = root.createElement('div');
            info.className = 'bid-status-info';

            const countEl = root.createElement('span');
            countEl.className = 'bid-status-count';
            countEl.textContent = String(count);

            const labelEl = root.createElement('span');
            labelEl.className = 'bid-status-label';
            labelEl.textContent = config.label;

            info.append(countEl, labelEl);

            const pctEl = root.createElement('span');
            pctEl.className = 'bid-status-pct';
            pctEl.style.color = config.color;
            pctEl.textContent = `${percentage}%`;

            card.append(iconWrap, info, pctEl);
            fragment.appendChild(card);
        }

        statusGrid.replaceChildren(fragment);
    }

    function renderTimeline(bids: MostaqlTimelineBid[]) {
        if (!(timelineContainer instanceof HTMLElement)) {
            return;
        }

        if (bids.length === 0) {
            timelineContainer.replaceChildren(
                createStateMessage(root, {
                    className: 'bids-empty',
                    iconClass: 'fa-inbox',
                    title: 'لا توجد عروض في آخر 30 يومًا',
                    detail: 'جميع العروض متاحة للاستخدام!',
                })
            );
            return;
        }

        const fragment = root.createDocumentFragment();

        for (const [index, bid] of bids.entries()) {
            const percentage = Math.min(100, Math.round((bid.ageMs / MOSTAQL_BID_WINDOW_MS) * 100));
            const color = getCountdownColor(percentage);
            const appliedDate = bid.published.toLocaleDateString('ar-EG', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
            });
            const appliedTime = bid.published.toLocaleTimeString('ar-EG', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'UTC',
            });

            const item = root.createElement('div');
            item.className = 'bid-timeline-item';
            item.dataset.index = String(index);

            const marker = root.createElement('div');
            marker.className = 'bid-timeline-marker';
            marker.style.background = color;

            const content = root.createElement('div');
            content.className = 'bid-timeline-content';

            const header = root.createElement('div');
            header.className = 'bid-timeline-header';

            const titleLink = root.createElement('a');
            titleLink.className = 'bid-timeline-title';
            titleLink.href = bid.url || '#';
            titleLink.target = '_blank';
            titleLink.rel = 'noreferrer';
            titleLink.textContent = bid.title || 'عرض بدون عنوان';

            const status = root.createElement('span');
            status.className = `bid-timeline-status ${getStatusCssClass(bid.status)}`;
            status.textContent = bid.status || 'بانتظار';

            header.append(titleLink, status);

            const meta = root.createElement('div');
            meta.className = 'bid-timeline-meta';

            const dateMeta = root.createElement('span');
            dateMeta.append(
                createIcon(root, 'fa-calendar-alt'),
                root.createTextNode(` ${appliedDate}`)
            );

            const timeMeta = root.createElement('span');
            timeMeta.append(createIcon(root, 'fa-clock'), root.createTextNode(` ${appliedTime}`));

            meta.append(dateMeta, timeMeta);

            if (bid.price) {
                const priceMeta = root.createElement('span');
                priceMeta.append(
                    createIcon(root, 'fa-dollar-sign'),
                    root.createTextNode(` ${bid.price}`)
                );
                meta.appendChild(priceMeta);
            }

            const progress = root.createElement('div');
            progress.className = 'bid-timeline-progress';

            const progressBar = root.createElement('div');
            progressBar.className = 'bid-progress-bar';

            const progressFill = root.createElement('div');
            progressFill.className = 'bid-progress-fill bid-tracker-bar';
            progressFill.dataset.msLeft = String(bid.msLeft);
            progressFill.style.width = `${percentage}%`;
            progressFill.style.background = color;

            progressBar.appendChild(progressFill);

            const countdown = root.createElement('span');
            countdown.className = 'bid-countdown bid-tracker-countdown';
            countdown.dataset.msLeft = String(bid.msLeft);
            countdown.style.color = color;
            countdown.textContent = formatCountdown(bid.msLeft);

            progress.append(progressBar, countdown);
            content.append(header, meta, progress);
            item.append(marker, content);
            fragment.appendChild(item);
        }

        timelineContainer.replaceChildren(fragment);
    }

    function clearCountdowns() {
        if (countdownTimer !== null) {
            window.clearInterval(countdownTimer);
            countdownTimer = null;
        }
    }

    function startCountdowns() {
        clearCountdowns();

        const updateAll = () => {
            root.querySelectorAll<HTMLElement>('.bid-tracker-countdown').forEach((element) => {
                let msLeft = Number.parseInt(element.dataset.msLeft ?? '0', 10);

                if (Number.isNaN(msLeft) || msLeft <= 0) {
                    element.textContent = 'متاح الآن!';
                    element.style.color = 'var(--success)';
                    return;
                }

                msLeft -= 1000;
                element.dataset.msLeft = String(msLeft);
                element.textContent = formatCountdown(msLeft);

                const percentage = Math.min(
                    100,
                    ((MOSTAQL_BID_WINDOW_MS - msLeft) / MOSTAQL_BID_WINDOW_MS) * 100
                );
                element.style.color = getCountdownColor(percentage);
            });

            root.querySelectorAll<HTMLElement>('.bid-tracker-bar').forEach((element) => {
                let msLeft = Number.parseInt(element.dataset.msLeft ?? '0', 10);

                if (Number.isNaN(msLeft) || msLeft <= 0) {
                    element.style.width = '100%';
                    element.style.background = 'var(--success)';
                    return;
                }

                msLeft -= 1000;
                element.dataset.msLeft = String(msLeft);

                const percentage = Math.min(
                    100,
                    ((MOSTAQL_BID_WINDOW_MS - msLeft) / MOSTAQL_BID_WINDOW_MS) * 100
                );
                element.style.width = `${percentage}%`;
                element.style.background = getCountdownColor(percentage);
            });
        };

        updateAll();
        countdownTimer = window.setInterval(updateAll, 1000);
    }

    async function load() {
        showLoadingState();

        try {
            const { homepageStats, stats } = await loadMostaqlBidTrackerData();
            renderSummary(stats, homepageStats);
            renderStatusCards(stats.byStatus, stats.total30d);
            renderTimeline(stats.bids);
            startCountdowns();
            isLoaded = true;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
            console.error('Bid tracker load failed:', error);
            showErrorState(message);
            isLoaded = false;
        }
    }

    async function initOnce() {
        if (isLoaded) {
            return;
        }

        await load();
    }

    async function refresh() {
        isLoaded = false;
        clearCountdowns();
        await load();
    }

    function bind() {
        if (isBound) {
            return;
        }

        isBound = true;

        root.getElementById('refreshBidsBtn')?.addEventListener('click', () => {
            void refresh();
        });

        timelineContainer?.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null;

            if (target?.closest('.btn-retry-bids')) {
                void refresh();
            }
        });
    }

    function destroy() {
        clearCountdowns();
    }

    return {
        bind,
        destroy,
        initOnce,
        refresh,
    };
}
