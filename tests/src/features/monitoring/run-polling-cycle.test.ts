import { describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';
import type { PlatformMonitoringAdapter } from '../../../../src/platforms/contracts';
import { runPollingCycle } from '../../../../src/features/monitoring/run-polling-cycle';
import { DEFAULT_RUNTIME_STATE, DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';
import type { StoredState } from '../../../../src/shared/storage/schema';

function createSnapshot(overrides: Partial<StoredState> = {}): StoredState {
    return {
        settings: DEFAULT_SETTINGS,
        seenJobs: [],
        recentJobs: [],
        stats: {
            lastCheck: null,
            todayCount: 0,
            todayDate: new Date().toDateString(),
        },
        trackedProjects: {},
        prompts: [],
        proposalTemplate: '',
        notificationsEnabled: true,
        runtime: DEFAULT_RUNTIME_STATE,
        ...overrides,
    };
}

function createStorage(snapshot: StoredState) {
    return {
        getSnapshot: vi.fn(async () => snapshot),
        touchLastCheck: vi.fn(async () => snapshot.stats),
        patchRuntimeState: vi.fn(async () => snapshot.runtime),
        ingestJobs: vi.fn(async (jobs: JobRecord[]) => ({
            newJobs: jobs,
            seenJobs: jobs.map((job) => `${job.platformId}:${job.id}`),
            recentJobs: jobs,
            stats: snapshot.stats,
            settings: snapshot.settings,
            notificationsEnabled: snapshot.notificationsEnabled,
        })),
        mergeRecentJobs: vi.fn(async (jobs: JobRecord[]) => jobs),
    } satisfies Pick<
        ExtensionStorage,
        'getSnapshot' | 'touchLastCheck' | 'patchRuntimeState' | 'ingestJobs' | 'mergeRecentJobs'
    >;
}

function createAdapter(
    overrides: Partial<PlatformMonitoringAdapter> = {}
): PlatformMonitoringAdapter {
    return {
        id: 'mostaql',
        displayName: 'مستقل',
        debugProbeUrl: 'https://mostaql.com/projects',
        resolveFeeds: () => ['https://mostaql.com/projects'],
        parseListingHtml: vi.fn(
            async (): Promise<readonly JobRecord[]> => [
                {
                    id: '1',
                    platformId: 'mostaql' as const,
                    title: 'TypeScript extension',
                    url: 'https://mostaql.com/project/1',
                },
            ]
        ),
        parseProjectHtml: vi.fn(async () => ({
            description: 'browser extension',
            budget: '$500',
            hiringRate: '95%',
            duration: '5 أيام',
        })),
        ...overrides,
    };
}

describe('polling cycle orchestration', () => {
    it('no-ops and touches last check when monitoring is disabled', async () => {
        const storage = createStorage(
            createSnapshot({
                settings: {
                    ...DEFAULT_SETTINGS,
                    systemEnabled: false,
                },
                seenJobs: ['mostaql:1'],
            })
        );

        await expect(
            runPollingCycle({
                storage: storage as unknown as ExtensionStorage,
                notifyJobs: async () => undefined,
                reason: 'manual',
                monitoring: [createAdapter()],
            })
        ).resolves.toEqual({
            kind: 'noop',
            source: 'polling',
            reason: 'system-disabled',
            totalChecked: 1,
        });
        expect(storage.touchLastCheck).toHaveBeenCalledWith('manual:disabled');
    });

    it('records no-platform state when all adapters are disabled by settings', async () => {
        const storage = createStorage(
            createSnapshot({
                settings: {
                    ...DEFAULT_SETTINGS,
                    monitoredPlatforms: {
                        mostaql: false,
                        khamsat: false,
                        nafezly: false,
                    },
                },
            })
        );

        await expect(
            runPollingCycle({
                storage: storage as unknown as ExtensionStorage,
                notifyJobs: async () => undefined,
                reason: 'manual',
                monitoring: [
                    createAdapter({
                        resolveFeeds: () => [],
                    }),
                ],
            })
        ).resolves.toMatchObject({
            kind: 'noop',
            reason: 'no-platforms',
        });
        expect(storage.patchRuntimeState).toHaveBeenCalledWith(
            expect.objectContaining({
                lastPollingReason: 'manual',
                lastMonitoringErrors: {},
            })
        );
    });

    it('fetches, hydrates, filters, merges, and publishes new polling jobs', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<main>fixture</main>'))
        );
        const notifyJobs = vi.fn(async () => undefined);
        const storage = createStorage(
            createSnapshot({
                settings: {
                    ...DEFAULT_SETTINGS,
                    keywordsInclude: 'extension',
                },
            })
        );

        await expect(
            runPollingCycle({
                storage: storage as unknown as ExtensionStorage,
                notifyJobs,
                reason: 'alarm',
                monitoring: [createAdapter()],
            })
        ).resolves.toMatchObject({
            kind: 'published',
            source: 'polling',
            newJobs: 1,
        });
        expect(storage.ingestJobs).toHaveBeenCalledWith([expect.objectContaining({ id: '1' })]);
        expect(storage.mergeRecentJobs).toHaveBeenCalledWith([
            expect.objectContaining({ description: 'browser extension' }),
        ]);
        expect(notifyJobs).toHaveBeenCalledWith([expect.objectContaining({ id: '1' })]);
    });

    it('records fetch errors without publishing jobs', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('blocked', { status: 403 }))
        );
        const storage = createStorage(createSnapshot({ seenJobs: ['mostaql:old'] }));

        await expect(
            runPollingCycle({
                storage: storage as unknown as ExtensionStorage,
                notifyJobs: async () => undefined,
                reason: 'alarm',
                monitoring: [createAdapter()],
            })
        ).resolves.toEqual({
            kind: 'failed',
            source: 'polling',
            reason: 'fetch-failed',
            totalChecked: 1,
            monitoringErrors: {
                mostaql: expect.objectContaining({
                    message: 'مستقل: Request failed with HTTP 403.',
                }),
            },
        });
        expect(storage.patchRuntimeState).toHaveBeenCalledWith(
            expect.objectContaining({
                lastPollingReason: 'alarm:fetch-failed',
                lastMonitoringErrors: {
                    mostaql: expect.objectContaining({
                        message: 'مستقل: Request failed with HTTP 403.',
                    }),
                },
            })
        );
    });
});
