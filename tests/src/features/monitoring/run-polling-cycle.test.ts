import { describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';
import type { PlatformMonitoringAdapter } from '../../../../src/platforms/contracts';
import {
    KHAMSAT_PUBLISH_FRESHNESS_HOURS,
    runPollingCycle,
} from '../../../../src/features/monitoring/run-polling-cycle';
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
        getUnseenJobs: vi.fn(async (jobs: JobRecord[]) =>
            jobs.filter((job) => !snapshot.seenJobs.includes(`${job.platformId}:${job.id}`))
        ),
        rememberJobsWithoutStats: vi.fn(async (jobs: JobRecord[]) => {
            snapshot.seenJobs = [
                ...snapshot.seenJobs,
                ...jobs.map((job) => `${job.platformId}:${job.id}`),
            ];

            return snapshot.seenJobs;
        }),
        ingestJobs: vi.fn(async (jobs: JobRecord[]) => {
            const newJobs = jobs.filter(
                (job) => !snapshot.seenJobs.includes(`${job.platformId}:${job.id}`)
            );

            snapshot.seenJobs = [
                ...snapshot.seenJobs,
                ...newJobs.map((job) => `${job.platformId}:${job.id}`),
            ];

            return {
                newJobs,
                seenJobs: snapshot.seenJobs,
                recentJobs: jobs,
                stats: snapshot.stats,
                settings: snapshot.settings,
                notificationsEnabled: snapshot.notificationsEnabled,
            };
        }),
        mergeRecentJobs: vi.fn(async (jobs: JobRecord[]) => jobs),
    } satisfies Pick<
        ExtensionStorage,
        | 'getSnapshot'
        | 'touchLastCheck'
        | 'patchRuntimeState'
        | 'getUnseenJobs'
        | 'rememberJobsWithoutStats'
        | 'ingestJobs'
        | 'mergeRecentJobs'
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
    it('uses a named 48-hour Khamsat publish freshness policy', () => {
        expect(KHAMSAT_PUBLISH_FRESHNESS_HOURS).toBe(48);
    });

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

    it('hydrates stale Khamsat candidates before remembering without stats or publishing', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<main>fixture</main>'))
        );
        const notifyJobs = vi.fn(async () => undefined);
        const storage = createStorage(createSnapshot());
        const khamsatJob: JobRecord = {
            id: '7',
            platformId: 'khamsat',
            title: 'طلب قديم',
            url: 'https://khamsat.com/community/requests/7-old',
            lastInteractionAt: '2026-06-05T10:00:00+03:00',
        };
        const adapter = createAdapter({
            id: 'khamsat',
            displayName: 'خمسات',
            debugProbeUrl: 'https://khamsat.com/community/requests',
            resolveFeeds: () => ['https://khamsat.com/community/requests'],
            parseListingHtml: vi.fn(async () => [khamsatJob]),
            parseProjectHtml: vi.fn(async () => ({
                postedAt: '2020-01-01T00:00:00.000Z',
                description: 'stale request',
            })),
        });

        await expect(
            runPollingCycle({
                storage: storage as unknown as ExtensionStorage,
                notifyJobs,
                reason: 'alarm',
                monitoring: [adapter],
            })
        ).resolves.toMatchObject({
            kind: 'noop',
            reason: 'no-new-jobs',
            totalChecked: 1,
        });
        expect(storage.rememberJobsWithoutStats).toHaveBeenCalledWith([
            expect.objectContaining({
                id: '7',
                postedAt: '2020-01-01T00:00:00.000Z',
            }),
        ]);
        expect(storage.ingestJobs).toHaveBeenCalledWith([]);
        expect(notifyJobs).not.toHaveBeenCalled();
    });

    it('publishes fresh Khamsat candidates after deterministic sidebar date hydration', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<main>fixture</main>'))
        );
        const notifyJobs = vi.fn(async () => undefined);
        const storage = createStorage(createSnapshot());
        const khamsatJob: JobRecord = {
            id: '9',
            platformId: 'khamsat',
            title: 'طلب جديد',
            url: 'https://khamsat.com/community/requests/9-fresh',
            lastInteractionAt: '2026-06-05T14:00:00+03:00',
        };
        const adapter = createAdapter({
            id: 'khamsat',
            displayName: 'خمسات',
            debugProbeUrl: 'https://khamsat.com/community/requests',
            resolveFeeds: () => ['https://khamsat.com/community/requests'],
            parseListingHtml: vi.fn(async () => [khamsatJob]),
            parseProjectHtml: vi.fn(async () => ({
                postedAt: '05/06/2026 08:30 GMT',
                description: 'fresh request',
            })),
        });

        await expect(
            runPollingCycle({
                storage: storage as unknown as ExtensionStorage,
                notifyJobs,
                reason: 'alarm',
                monitoring: [adapter],
            })
        ).resolves.toMatchObject({
            kind: 'published',
            source: 'polling',
            newJobs: 1,
            totalChecked: 1,
        });
        expect(storage.rememberJobsWithoutStats).not.toHaveBeenCalled();
        expect(storage.ingestJobs).toHaveBeenCalledWith([
            expect.objectContaining({
                id: '9',
                postedAt: '05/06/2026 08:30 GMT',
            }),
        ]);
        expect(notifyJobs).toHaveBeenCalledWith([
            expect.objectContaining({
                id: '9',
                postedAt: '05/06/2026 08:30 GMT',
            }),
        ]);
    });

    it('leaves Khamsat candidates retryable when detail publish time is missing', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<main>fixture</main>'))
        );
        const storage = createStorage(createSnapshot());
        const khamsatJob: JobRecord = {
            id: '8',
            platformId: 'khamsat',
            title: 'طلب بلا تاريخ نشر',
            url: 'https://khamsat.com/community/requests/8-missing-date',
            lastInteractionAt: '2026-06-05T10:00:00+03:00',
        };
        const adapter = createAdapter({
            id: 'khamsat',
            displayName: 'خمسات',
            debugProbeUrl: 'https://khamsat.com/community/requests',
            resolveFeeds: () => ['https://khamsat.com/community/requests'],
            parseListingHtml: vi.fn(async () => [khamsatJob]),
            parseProjectHtml: vi.fn(async () => ({
                description: 'missing publish date',
            })),
        });

        await expect(
            runPollingCycle({
                storage: storage as unknown as ExtensionStorage,
                notifyJobs: async () => undefined,
                reason: 'alarm',
                monitoring: [adapter],
            })
        ).resolves.toMatchObject({
            kind: 'noop',
            reason: 'no-new-jobs',
            totalChecked: 0,
        });
        expect(storage.rememberJobsWithoutStats).not.toHaveBeenCalled();
        expect(storage.ingestJobs).toHaveBeenCalledWith([]);
        expect(storage.patchRuntimeState).toHaveBeenCalledWith(
            expect.objectContaining({
                lastMonitoringErrors: {
                    khamsat: expect.objectContaining({
                        message: 'Khamsat: missing publish date after detail hydration for job 8.',
                    }),
                },
            })
        );
    });
});
