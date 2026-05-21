import { browser } from 'wxt/browser';

import type { ProposalRepository } from '../../features/proposals/proposal-repository';
import type { TrackedProjectRecord } from '../../platforms/contracts';
import {
    getPlatformDisplayName,
    resolvePlatformId,
} from '../../platforms/platform-ids';
import { parseDurationDays } from '../../shared/parsing/duration';
import { parseBudgetFloor } from '../../shared/parsing/numbers';

type TrackedProjectView = TrackedProjectRecord;

interface TrackedProjectsPanelDependencies {
    readonly proposalRepository: Pick<ProposalRepository, 'getQuickTemplate' | 'queueAutofill'>;
}

export function createTrackedProjectsPanel(
    root: Document,
    deps: TrackedProjectsPanelDependencies
) {
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
        const emphasis = root.createElement('strong');

        paragraph.className = 'help-text empty-state';
        paragraph.append('لا توجد مشاريع مراقبة. افتح أي مشروع مدعوم واضغط ');
        emphasis.textContent = 'متابعة';
        paragraph.append(emphasis, ' لإضافته هنا.');

        return paragraph;
    }

    function createTrackedProjectCard(job: TrackedProjectView): HTMLDivElement {
        const platformId = resolvePlatformId(job.platformId, {
            url: job.url,
        });
        const platformName = getPlatformDisplayName(platformId);
        const budget = job.budget || 'غير محدد';
        const duration = job.duration || '';
        const poster = job.clientName || '';
        const timeAgo = job.publishDate || '';
        const bidsText = job.communications ? `${job.communications} تواصل` : '';
        const status = job.status || 'مفتوح';

        let statusClass = 'mj-status-open';
        if (status.includes('تنفيذ') || status.includes('جارٍ')) {
            statusClass = 'mj-status-processing';
        }
        if (status.includes('مغلق') || status.includes('مكتمل') || status.includes('ملغى')) {
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
        link.textContent = job.title || 'بدون عنوان';

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

        if (budget !== 'غير محدد') {
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
        applyButton.append(applyIcon, ' قدّم الآن');

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
