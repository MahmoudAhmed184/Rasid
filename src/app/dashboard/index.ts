import './dashboard.css';
import './dashboard-bids.css';
import '../../shared/dom/icon-shim.css';

import { createBidTracker } from './bid-tracker';
import { createConnectionStatusPanel } from './connection';
import { createPromptManager } from './prompts';
import { createTrackedProjectsPanel } from './projects';
import { createSettingsForm } from './settings';
import { createTabController } from './tabs';
import type { BackupRepository } from '../../features/backup/repository';
import type { MonitoringRepository } from '../../features/monitoring/repository';
import type { PromptRepository } from '../../features/proposals/prompt-repository';
import type { ProposalRepository } from '../../features/proposals/proposal-repository';
import type { SettingsRepository } from '../../features/settings/repository';
import type { TrackingRepository } from '../../features/monitoring/tracking-repository';

interface DashboardDependencies {
    readonly backupRepository: Pick<BackupRepository, 'exportAll' | 'importAll'>;
    readonly monitoringRepository: Pick<MonitoringRepository, 'getOverview'>;
    readonly promptRepository: Pick<PromptRepository, 'list' | 'save' | 'remove'>;
    readonly proposalRepository: Pick<
        ProposalRepository,
        'getQuickTemplate' | 'setQuickTemplate' | 'queueAutofill'
    >;
    readonly settingsRepository: Pick<SettingsRepository, 'get' | 'save' | 'update'>;
    readonly trackingRepository: Pick<TrackingRepository, 'list'>;
}

function getElement<T extends HTMLElement>(id: string) {
    return document.getElementById(id) as T | null;
}

function updateOverviewStats(
    stats: { readonly todayCount?: number; readonly lastCheck?: string | null },
    trackedCount: number
) {
    const todayEl = getElement<HTMLElement>('stat-today');
    const totalEl = getElement<HTMLElement>('stat-total');
    const lastTimeEl = getElement<HTMLElement>('stat-last-time');

    if (todayEl) {
        const todayCount = Number.parseInt(String(stats.todayCount ?? 0), 10);
        todayEl.textContent = String(Number.isNaN(todayCount) ? 0 : todayCount);
    }

    if (totalEl) {
        totalEl.textContent = String(trackedCount);
    }

    if (lastTimeEl) {
        lastTimeEl.textContent = stats.lastCheck
            ? new Date(stats.lastCheck).toLocaleTimeString('ar-EG')
            : '-';
    }
}

function createDashboardApp(root: Document, deps: DashboardDependencies) {
    const connectionPanel = createConnectionStatusPanel(root, {
        monitoringRepository: deps.monitoringRepository,
    });
    const trackedProjectsPanel = createTrackedProjectsPanel(root, {
        proposalRepository: deps.proposalRepository,
    });
    const settingsForm = createSettingsForm(root, {
        repositories: {
            backupRepository: deps.backupRepository,
            proposalRepository: deps.proposalRepository,
            settingsRepository: deps.settingsRepository,
        },
        onSaved: () => {
            void connectionPanel.load();
        },
    });
    const promptManager = createPromptManager(root, {
        promptRepository: deps.promptRepository,
        onSaved: settingsForm.showSaveStatus,
    });
    const bidTracker = createBidTracker(root);
    const tabs = createTabController(root, {
        onTabActivated: (tabId) => {
            if (tabId === 'bids-tracker') {
                void bidTracker.initOnce();
            }
        },
    });

    async function loadData() {
        const [overview, settings, trackedProjects, proposalTemplate, prompts] = await Promise.all([
            deps.monitoringRepository.getOverview(),
            deps.settingsRepository.get(),
            deps.trackingRepository.list(),
            deps.proposalRepository.getQuickTemplate(),
            deps.promptRepository.list(),
        ]);

        const visibleTrackedProjects = trackedProjects.sort((left, right) =>
            String(right.lastChecked ?? '').localeCompare(String(left.lastChecked ?? ''))
        );

        updateOverviewStats(overview.stats, visibleTrackedProjects.length);
        trackedProjectsPanel.render(visibleTrackedProjects);
        settingsForm.apply(settings);

        const proposalTemplateEl = getElement<HTMLTextAreaElement>('proposalTemplate');
        if (proposalTemplateEl) {
            proposalTemplateEl.value = proposalTemplate;
        }

        promptManager.render(prompts);
    }

    async function init() {
        trackedProjectsPanel.bind();
        settingsForm.bind();
        promptManager.bind();
        bidTracker.bind();
        tabs.bind();

        await Promise.all([loadData(), connectionPanel.load()]);
    }

    function destroy() {
        bidTracker.destroy();
        settingsForm.destroy();
    }

    return {
        init,
        destroy,
    };
}

export function bootstrapDashboard(root: Document = document, deps: DashboardDependencies) {
    const app = createDashboardApp(root, deps);
    void app.init();

    root.defaultView?.addEventListener(
        'beforeunload',
        () => {
            app.destroy();
        },
        { once: true }
    );
}
