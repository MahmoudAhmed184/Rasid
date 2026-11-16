import { browser } from 'wxt/browser';

import type { ProposalRepository } from '../../features/proposals/proposal-repository';
import type { TrackedProjectRecord } from '../../platforms/contracts';
import { resolvePlatformId } from '../../platforms/platform-ids';
import { parseDurationDays } from '../../shared/parsing/duration';
import { parseBudgetFloor } from '../../shared/parsing/numbers';
import { getLanguage, t } from '../../shared/i18n';

type TrackedProjectView = TrackedProjectRecord;

interface TrackedProjectsPanelDependencies {
    readonly proposalRepository: Pick<ProposalRepository, 'getQuickTemplate' | 'queueAutofill'>;
}

export function createTrackedProjectsPanel(root: Document, deps: TrackedProjectsPanelDependencies) {
    const list = root.getElementById('recentProjectsList');
    let isBound = false;

    function createMetaItem(iconClassName: string, text: string): HTMLLIElement {
        const item = root.createElement('li');
        const icon = root.createElement('i');

        icon.className = iconClassName;
        item.append(icon, ` ${text}`);

        return item;
    }

    function createEmptyState(): HTMLParagraphElement {
        const paragraph = root.createElement('p');
        paragraph.className = 'help-text empty-state';
        paragraph.textContent = t('overview.no_projects');
        return paragraph;
    }

    function formatDashboardProjectStatus(status: string | undefined): string {
        if (!status) {
            return t('common.open');
        }
        if (getLanguage() === 'ar') {
            return status;
        }
        if (status.includes('مفتوح') || status.toLowerCase().includes('open')) {
            return t('common.open');
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

    function createTrackedProjectCard(job: TrackedProjectView): HTMLDivElement {
        const platformId = resolvePlatformId(job.platformId, {
            url: job.url,
        });
        const platformName =
            platformId === 'khamsat'
                ? t('popup.marketplaces.khamsat')
                : platformId === 'nafezly'
                  ? t('popup.marketplaces.nafezly')
                  : t('popup.marketplaces.mostaql');
        const budget = job.budget || t('common.not_specified');
        const duration = job.duration || '';
        const poster = job.clientName || '';
        const timeAgo = job.publishDate || '';
        const bidsText = job.communications
            ? t('overview.communications', { count: job.communications })
            : '';
        const rawStatus = job.status || '';
        const status = formatDashboardProjectStatus(job.status);

        let statusClass = 'mj-status-open';
        if (
            rawStatus.includes('تنفيذ') ||
            rawStatus.includes('جارٍ') ||
            rawStatus.toLowerCase().includes('progress')
        ) {
            statusClass = 'mj-status-processing';
        }
        if (
            rawStatus.includes('مغلق') ||
            rawStatus.includes('مكتمل') ||
            rawStatus.includes('ملغى') ||
            rawStatus.toLowerCase().includes('closed') ||
            rawStatus.toLowerCase().includes('completed')
        ) {
            statusClass = 'mj-status-closed';
        }

        const card = root.createElement('div');
        card.className = 'mj-project-item';

        const title = root.createElement('h5');
        title.className = 'mj-project-title';

        const link = root.createElement('a');
        link.href = job.url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = job.title || t('common.untitled');

        const platformBadge = root.createElement('span');
        platformBadge.className = 'mj-platform-badge';
        platformBadge.textContent = platformName;

        const statusBadge = root.createElement('span');
        statusBadge.className = `mj-status-badge ${statusClass}`;
        statusBadge.textContent = status;

        title.append(link, platformBadge, statusBadge);

        const meta = root.createElement('ul');
        meta.className = 'mj-project-meta';

        if (poster) {
            meta.appendChild(createMetaItem('fas fa-user', poster));
        }

        if (timeAgo) {
            meta.appendChild(createMetaItem('fas fa-clock', timeAgo));
        }

        if (bidsText) {
            meta.appendChild(createMetaItem('fas fa-handshake', bidsText));
        }

        if (budget && budget !== 'غير محدد' && budget !== t('common.not_specified')) {
            meta.appendChild(createMetaItem('fas fa-dollar-sign', budget));
        }

        const actions = root.createElement('div');
        actions.className = 'mj-project-actions';

        const applyButton = root.createElement('a');
        applyButton.href = job.url;
        applyButton.target = '_blank';
        applyButton.rel = 'noreferrer';
        applyButton.className = 'btn-view-project btn-apply-autofill';
        applyButton.dataset.id = job.id ?? '';
        applyButton.dataset.platformId = platformId;
        applyButton.dataset.budget = budget;
        applyButton.dataset.duration = duration;

        const applyIcon = root.createElement('i');
        applyIcon.className = 'fas fa-paper-plane';
        applyButton.append(applyIcon, ` ${t('overview.autofill_btn')}`);

        actions.appendChild(applyButton);
        card.append(title, meta, actions);

        return card;
    }

    function bind() {
        if (isBound || !(list instanceof HTMLElement)) {
            return;
        }

        isBound = true;

        list.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null;
            const button = target?.closest<HTMLAnchorElement>('.btn-apply-autofill');

            if (!button) {
                return;
            }

            event.preventDefault();

            void (async () => {
                const proposal = await deps.proposalRepository.getQuickTemplate();

                await deps.proposalRepository.queueAutofill({
                    platformId: resolvePlatformId(button.dataset.platformId),
                    projectId: button.dataset.id ?? '',
                    amount: parseBudgetFloor(button.dataset.budget),
                    durationDays: parseDurationDays(button.dataset.duration ?? ''),
                    proposal,
                    createdAt: Date.now(),
                });

                await browser.tabs.create({ url: button.href });
            })();
        });
    }

    function render(jobs: TrackedProjectView[]) {
        if (!(list instanceof HTMLElement)) {
            return;
        }

        if (jobs.length === 0) {
            list.replaceChildren(createEmptyState());
            return;
        }

        list.replaceChildren(...jobs.slice(0, 7).map((job) => createTrackedProjectCard(job)));
    }

    return {
        bind,
        render,
    };
}
