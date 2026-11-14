import { describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';
import type { PlatformMonitoringAdapter } from '../../../../src/platforms/contracts';
import {
    KHAMSAT_PUBLISH_FRESHNESS_HOURS,
    isManualMonitoringScan,
    mapConcurrent,
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
        parseListingHtml: vi.fn(async (): Promise<readonly JobRecord[]> => [
            {
                id: '1',
                platformId: 'mostaql' as const,
                title: 'TypeScript extension',
                url: 'https://mostaql.com/project/1',
            },
        ]),
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

    it('fetches feeds in parallel and hydrates new jobs per-platform without cross-platform blocking', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<main>fixture</main>'))
        );
        const notifyJobs = vi.fn(async () => undefined);
        const playNotificationSound = vi.fn(async () => undefined);
        const storage = createStorage(createSnapshot());

        const mostaqlAdapter = createAdapter({
            id: 'mostaql',
            displayName: 'مستقل',
            resolveFeeds: () => ['https://mostaql.com/projects'],
            parseListingHtml: vi.fn(async () => [
                {
                    id: 'm1',
                    platformId: 'mostaql' as const,
                    title: 'مشروع مستقل',
                    url: 'https://mostaql.com/project/m1',
                },
            ]),
            parseProjectHtml: vi.fn(async () => ({
                budget: '$300',
                description: 'وصف مستقل',
            })),
        });

        const nafezlyAdapter = createAdapter({
            id: 'nafezly',
            displayName: 'نفذلي',
            resolveFeeds: () => ['https://nafezly.com/projects'],
            parseListingHtml: vi.fn(async () => [
                {
                    id: 'n1',
                    platformId: 'nafezly' as const,
                    title: 'مشروع نفذلي',
                    url: 'https://nafezly.com/project/n1',
                },
            ]),
            parseProjectHtml: vi.fn(async () => ({
                budget: '$150',
                description: 'وصف نفذلي',
            })),
        });

        const result = await runPollingCycle({
            storage: storage as unknown as ExtensionStorage,
            notifyJobs,
            playNotificationSound,
            reason: 'manual-check',
            monitoring: [mostaqlAdapter, nafezlyAdapter],
        });

        expect(result).toMatchObject({
            kind: 'published',
            source: 'polling',
            newJobs: 2,
        });

        expect(notifyJobs).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'm1', budget: '$300' }),
            expect.objectContaining({ id: 'n1', budget: '$150' }),
        ]);
        expect(playNotificationSound).toHaveBeenCalledOnce();
    });

    it('bypasses hydration serial delays during manual-check scans for instant responsiveness', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<main>fixture</main>'))
        );
        const notifyJobs = vi.fn(async () => undefined);
        const storage = createStorage(createSnapshot());

        const mostaqlAdapter = createAdapter({
            id: 'mostaql',
            displayName: 'مستقل',
            hydrationDelayMs: 3000,
            resolveFeeds: () => ['https://mostaql.com/projects'],
            parseListingHtml: vi.fn(async () => [
                {
                    id: 'm1',
                    platformId: 'mostaql' as const,
                    title: 'مشروع 1',
                    url: 'https://mostaql.com/projects/m1',
                },
                {
                    id: 'm2',
                    platformId: 'mostaql' as const,
                    title: 'مشروع 2',
                    url: 'https://mostaql.com/projects/m2',
                },
            ]),
            parseProjectHtml: vi.fn(async () => ({
                budget: '$200',
                description: 'تفاصيل سريعة',
            })),
        });

        const start = Date.now();
        const result = await runPollingCycle({
            storage: storage as unknown as ExtensionStorage,
            notifyJobs,
            reason: 'manual-check',
            monitoring: [mostaqlAdapter],
        });
        const elapsed = Date.now() - start;

        expect(result).toMatchObject({
            kind: 'published',
            source: 'polling',
            newJobs: 2,
        });
        // Both jobs should be hydrated promptly in parallel, taking well under the 3000ms delay per job
        expect(elapsed).toBeLessThan(1000);
        expect(notifyJobs).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'm1', budget: '$200' }),
            expect.objectContaining({ id: 'm2', budget: '$200' }),
        ]);
    });

    it('identifies manual scan reasons reliably across variants', () => {
        expect(isManualMonitoringScan('manual-check')).toBe(true);
        expect(isManualMonitoringScan('manual')).toBe(true);
        expect(isManualMonitoringScan('manual_scan')).toBe(true);
        expect(isManualMonitoringScan('checkNow')).toBe(true);
        expect(isManualMonitoringScan('check-now')).toBe(true);
        expect(isManualMonitoringScan('scan-now')).toBe(true);
        expect(isManualMonitoringScan('alarm')).toBe(false);
        expect(isManualMonitoringScan('jobs-poll-alarm')).toBe(false);
        expect(isManualMonitoringScan('signalr-connect-failed')).toBe(false);
        expect(isManualMonitoringScan('worker-start')).toBe(false);
    });

    it('mapConcurrent bounds maximum concurrent workers and preserves order', async () => {
        let activeWorkers = 0;
        let peakWorkers = 0;
        const items = [10, 20, 30, 40, 50, 60, 70];

        const results = await mapConcurrent(items, 3, async (item) => {
            activeWorkers++;
            peakWorkers = Math.max(peakWorkers, activeWorkers);
            await new Promise((resolve) => setTimeout(resolve, 5));
            activeWorkers--;
            return item * 2;
        });

        expect(peakWorkers).toBeLessThanOrEqual(3);
        expect(results).toEqual([20, 40, 60, 80, 100, 120, 140]);

        const empty = await mapConcurrent([], 3, async () => 'never');
        expect(empty).toEqual([]);
    });

    it('enforces fast fetch timeouts during manual scans and does not record false Khamsat errors on budget exhaustion', async () => {
        const fetchSpy = vi.fn(async () => new Response('<main>job feed</main>'));
        vi.stubGlobal('fetch', fetchSpy);

        const notifyJobs = vi.fn(async () => undefined);
        const storage = createStorage(createSnapshot());

        const khamsatAdapter = createAdapter({
            id: 'khamsat',
            displayName: 'خمسات',
            resolveFeeds: () => ['https://khamsat.com/community/requests'],
            parseListingHtml: vi.fn(async () => [
                {
                    id: 'k-budget-exhausted',
                    platformId: 'khamsat' as const,
                    title: 'طلب خمسات',
                    url: 'https://khamsat.com/community/requests/1',
                },
            ]),
            parseProjectHtml: vi.fn(async () => ({
                postedAt: 'منذ ساعتين',
                description: 'وصف',
            })),
        });

        let currentTime = 1_000_000;
        const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
            const time = currentTime;
            currentTime += 10_000;
            return time;
        });

        try {
            const result = await runPollingCycle({
                storage: storage as unknown as ExtensionStorage,
                notifyJobs,
                reason: 'manual-check',
                monitoring: [khamsatAdapter],
            });

            // The job timed out out of budget, so it was excluded from eligibleJobs without falsely marking monitoringErrors.khamsat
            expect(result).toMatchObject({
                kind: 'noop',
                source: 'polling',
                reason: 'no-new-jobs',
            });
            const snapshot = await storage.getSnapshot();
            expect(snapshot.runtime.lastMonitoringErrors.khamsat).toBeUndefined();
        } finally {
            dateSpy.mockRestore();
        }
    });
});
