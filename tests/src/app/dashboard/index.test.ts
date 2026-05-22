import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_RUNTIME_STATE, DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import type { MonitoringOverview } from '../../../../src/features/monitoring/repository';
import type { PromptTemplate } from '../../../../src/entities/prompt/model';
import type { TrackedProjectRecord } from '../../../../src/platforms/contracts';
import { installTestDom } from '../../../support/html';

const childModules = vi.hoisted(() => {
    const state = {
        connectionLoad: vi.fn(async () => undefined),
        trackedBind: vi.fn(),
        trackedRender: vi.fn(),
        settingsApply: vi.fn(),
        settingsBind: vi.fn(),
        settingsDestroy: vi.fn(),
        settingsShowSaveStatus: vi.fn(),
        promptRender: vi.fn(),
        promptBind: vi.fn(),
        bidBind: vi.fn(),
        bidDestroy: vi.fn(),
        bidInitOnce: vi.fn(async () => undefined),
        tabsBind: vi.fn(),
        onTabActivated: undefined as ((tabId: string) => void) | undefined,
    };

    return {
        state,
        reset() {
            for (const value of Object.values(state)) {
                if (typeof value === 'function' && 'mockClear' in value) {
                    value.mockReset();
                }
            }
            state.connectionLoad.mockResolvedValue(undefined);
            state.bidInitOnce.mockResolvedValue(undefined);
            state.onTabActivated = undefined;
        },
    };
});

vi.mock('../../../../src/app/dashboard/connection', () => ({
    createConnectionStatusPanel: vi.fn(() => ({
        load: childModules.state.connectionLoad,
    })),
}));

vi.mock('../../../../src/app/dashboard/projects', () => ({
    createTrackedProjectsPanel: vi.fn(() => ({
        bind: childModules.state.trackedBind,
        render: childModules.state.trackedRender,
    })),
}));

vi.mock('../../../../src/app/dashboard/settings', () => ({
    createSettingsForm: vi.fn(() => ({
        apply: childModules.state.settingsApply,
        bind: childModules.state.settingsBind,
        destroy: childModules.state.settingsDestroy,
        showSaveStatus: childModules.state.settingsShowSaveStatus,
    })),
}));

vi.mock('../../../../src/app/dashboard/prompts', () => ({
    createPromptManager: vi.fn(() => ({
        bind: childModules.state.promptBind,
        render: childModules.state.promptRender,
    })),
}));

vi.mock('../../../../src/app/dashboard/bid-tracker', () => ({
    createBidTracker: vi.fn(() => ({
        bind: childModules.state.bidBind,
        destroy: childModules.state.bidDestroy,
        initOnce: childModules.state.bidInitOnce,
    })),
}));

vi.mock('../../../../src/app/dashboard/tabs', () => ({
    createTabController: vi.fn(
        (_root: Document, options: { onTabActivated(tabId: string): void }) => {
            childModules.state.onTabActivated = options.onTabActivated;

            return {
                bind: childModules.state.tabsBind,
            };
        }
    ),
}));

interface DashboardTestDependencies {
    readonly backupRepository: {
        exportAll(): Promise<Record<string, unknown>>;
        importAll(snapshot: unknown): Promise<void>;
    };
    readonly monitoringRepository: {
        getOverview(): Promise<MonitoringOverview>;
    };
    readonly promptRepository: {
        list(): Promise<PromptTemplate[]>;
        save(prompt: PromptTemplate): Promise<PromptTemplate>;
        remove(promptId: string): Promise<PromptTemplate[]>;
    };
    readonly proposalRepository: {
        getQuickTemplate(): Promise<string>;
        setQuickTemplate(template: string): Promise<string>;
        queueAutofill(draft: unknown): Promise<void>;
    };
    readonly settingsRepository: {
        get(): Promise<typeof DEFAULT_SETTINGS>;
        save(settings: typeof DEFAULT_SETTINGS): Promise<typeof DEFAULT_SETTINGS>;
        update(patch: Partial<typeof DEFAULT_SETTINGS>): Promise<typeof DEFAULT_SETTINGS>;
    };
    readonly trackingRepository: {
        list(): Promise<TrackedProjectRecord[]>;
    };
}

function installDashboardDom(): Document {
    return installTestDom(`
        <main>
            <output id="stat-today"></output>
            <output id="stat-total"></output>
            <output id="stat-last-time"></output>
            <textarea id="proposalTemplate"></textarea>
        </main>
    `);
}

function createDependencies(): DashboardTestDependencies {
    const trackedProjects: TrackedProjectRecord[] = [
        {
            id: 'old',
            platformId: 'mostaql',
            title: 'Older project',
            url: 'https://mostaql.com/project/old',
            lastChecked: '2026-05-21T08:00:00.000Z',
        },
        {
            id: 'new',
            platformId: 'khamsat',
            title: 'Newer project',
            url: 'https://khamsat.com/community/requests/new',
            lastChecked: '2026-05-22T10:00:00.000Z',
        },
        {
            id: 'unknown',
            platformId: 'nafezly',
            title: 'No check date',
            url: 'https://nafezly.com/project/unknown',
        },
    ];

    return {
        backupRepository: {
            exportAll: vi.fn(async () => ({})),
            importAll: vi.fn(async () => undefined),
        },
        monitoringRepository: {
            getOverview: vi.fn(async () => ({
                stats: {
                    todayCount: 4,
                    lastCheck: '2026-05-22T12:30:00.000Z',
                    todayDate: '2026-05-22',
                },
                seenJobsCount: 12,
                notificationsEnabled: true,
                runtime: DEFAULT_RUNTIME_STATE,
                notificationMode: DEFAULT_SETTINGS.notificationMode,
            })),
        },
        promptRepository: {
            list: vi.fn(async () => [
                {
                    id: 'default_proposal',
                    title: 'Default',
                    content: 'اكتب عرضا',
                },
            ]),
            save: vi.fn(async (prompt: PromptTemplate) => prompt),
            remove: vi.fn(async () => []),
        },
        proposalRepository: {
            getQuickTemplate: vi.fn(async () => 'Quick proposal template'),
            setQuickTemplate: vi.fn(async (template: string) => template),
            queueAutofill: vi.fn(async () => undefined),
        },
        settingsRepository: {
            get: vi.fn(async () => DEFAULT_SETTINGS),
            save: vi.fn(async (settings: typeof DEFAULT_SETTINGS) => settings),
            update: vi.fn(async () => DEFAULT_SETTINGS),
        },
        trackingRepository: {
            list: vi.fn(async () => [...trackedProjects]),
        },
    };
}

describe('dashboard bootstrap', () => {
    beforeEach(async () => {
        childModules.reset();
        vi.resetModules();
    });

    it('initializes panels, renders repository data, and cleans up on unload', async () => {
        const document = installDashboardDom();
        const deps = createDependencies();
        const { bootstrapDashboard } = await import('../../../../src/app/dashboard');

        bootstrapDashboard(document, deps);

        expect(childModules.state.trackedBind).toHaveBeenCalledOnce();
        expect(childModules.state.settingsBind).toHaveBeenCalledOnce();
        expect(childModules.state.promptBind).toHaveBeenCalledOnce();
        expect(childModules.state.bidBind).toHaveBeenCalledOnce();
        expect(childModules.state.tabsBind).toHaveBeenCalledOnce();

        await vi.waitFor(() => {
            expect(childModules.state.connectionLoad).toHaveBeenCalledOnce();
            expect(childModules.state.trackedRender).toHaveBeenCalledOnce();
        });

        expect(document.getElementById('stat-today')?.textContent).toBe('4');
        expect(document.getElementById('stat-total')?.textContent).toBe('3');
        expect(document.getElementById('stat-last-time')?.textContent).not.toBe('-');
        expect((document.getElementById('proposalTemplate') as HTMLTextAreaElement).value).toBe(
            'Quick proposal template'
        );

        expect(childModules.state.settingsApply).toHaveBeenCalledWith(DEFAULT_SETTINGS);
        expect(childModules.state.promptRender).toHaveBeenCalledWith([
            {
                id: 'default_proposal',
                title: 'Default',
                content: 'اكتب عرضا',
            },
        ]);
        expect(childModules.state.trackedRender).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'new' }),
            expect.objectContaining({ id: 'old' }),
            expect.objectContaining({ id: 'unknown' }),
        ]);

        childModules.state.onTabActivated?.('settings');
        expect(childModules.state.bidInitOnce).not.toHaveBeenCalled();

        childModules.state.onTabActivated?.('bids-tracker');
        expect(childModules.state.bidInitOnce).toHaveBeenCalledOnce();

        document.defaultView?.dispatchEvent(new Event('beforeunload'));
        expect(childModules.state.bidDestroy).toHaveBeenCalledOnce();
        expect(childModules.state.settingsDestroy).toHaveBeenCalledOnce();
    });

    it('falls back to zero and dash overview values when stats are malformed or missing', async () => {
        const document = installDashboardDom();
        const deps = createDependencies();
        vi.mocked(deps.monitoringRepository.getOverview).mockResolvedValueOnce({
            stats: {
                todayCount: Number.NaN,
                lastCheck: null,
                todayDate: '2026-05-22',
            },
            seenJobsCount: 0,
            notificationsEnabled: true,
            runtime: DEFAULT_RUNTIME_STATE,
            notificationMode: DEFAULT_SETTINGS.notificationMode,
        });
        vi.mocked(deps.trackingRepository.list).mockResolvedValueOnce([]);
        const { bootstrapDashboard } = await import('../../../../src/app/dashboard');

        bootstrapDashboard(document, deps);

        await vi.waitFor(() => {
            expect(childModules.state.trackedRender).toHaveBeenCalledWith([]);
        });

        expect(document.getElementById('stat-today')?.textContent).toBe('0');
        expect(document.getElementById('stat-total')?.textContent).toBe('0');
        expect(document.getElementById('stat-last-time')?.textContent).toBe('-');
    });
});
