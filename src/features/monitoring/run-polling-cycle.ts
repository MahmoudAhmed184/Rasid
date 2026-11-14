import { applyJobFilters } from './job-filters';
import { fetchPlatformFeedJobsResult, hydratePlatformJob } from './fetch-platform-html';
import { delay } from '../../shared/network/delay';
import {
    createFailedJobBatchResult,
    createNoopJobBatchResult,
    publishJobBatch,
    type JobBatchResult,
    type JobNotifier,
} from './job-batch-publisher';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import type { JobRecord } from '../../entities/job/model';
import type { PlatformMonitoringAdapter } from '../../platforms/contracts';
import type { PlatformId } from '../../platforms/platform-ids';
import { getJobRecordKey, resolveJobPlatformId } from '../../entities/job/identity';
import { parseJobPostedAt } from '../../shared/parsing/arabic-date';

export const KHAMSAT_PUBLISH_FRESHNESS_HOURS = 48;
const KHAMSAT_PUBLISH_FRESHNESS_WINDOW_MS = KHAMSAT_PUBLISH_FRESHNESS_HOURS * 60 * 60 * 1000;

export const MANUAL_SCAN_TOTAL_BUDGET_MS = 3800;
export const MANUAL_SCAN_FETCH_TIMEOUT_MS = 2000;
export const MANUAL_SCAN_HYDRATION_BUDGET_MS = 1500;
export const MANUAL_SCAN_CONCURRENCY = 4;
export const MAX_MANUAL_SCAN_SYNC_HYDRATION_PER_PLATFORM = 4;

export function isManualMonitoringScan(reason: string): boolean {
    const normalized = reason.toLowerCase();
    return (
        normalized.includes('manual') ||
        normalized.includes('checknow') ||
        normalized.includes('check-now') ||
        normalized.includes('scan')
    );
}

export async function mapConcurrent<T, R>(
    items: readonly T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    if (items.length === 0) {
        return [];
    }
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (nextIndex < items.length) {
            const current = nextIndex++;
            results[current] = await fn(items[current], current);
        }
    }

    const workerCount = Math.min(concurrency, items.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
    return results;
}

function classifyKhamsatFreshness(
    job: Readonly<JobRecord>,
    now: Date
): 'fresh' | 'stale' | 'retry' {
    const postedAt = parseJobPostedAt(job.postedAt, now) ?? parseJobPostedAt(job.time, now);

    if (!postedAt) {
        return 'retry';
    }

    return postedAt.getTime() >= now.getTime() - KHAMSAT_PUBLISH_FRESHNESS_WINDOW_MS
        ? 'fresh'
        : 'stale';
}

export async function runPollingCycle(options: {
    storage: ExtensionStorage;
    notifyJobs: JobNotifier;
    reason: string;
    monitoring: readonly PlatformMonitoringAdapter[];
    playNotificationSound?: () => Promise<void>;
}): Promise<JobBatchResult> {
    const { storage, notifyJobs, reason, monitoring, playNotificationSound } = options;
    const scanStartTime = Date.now();
    const isManualScan = isManualMonitoringScan(reason);
    const scanDeadline = isManualScan ? scanStartTime + MANUAL_SCAN_TOTAL_BUDGET_MS : Infinity;
    const snapshot = await storage.getSnapshot();
    const settings = snapshot.settings;
    const attemptedAt = new Date().toISOString();
    const monitoringErrors: Record<string, { message: string; failedAt: string }> = {};
    const lastHydrationTime = new Map<PlatformId, number>();

    if (settings.systemEnabled === false) {
        await storage.touchLastCheck(`${reason}:disabled`);
        return createNoopJobBatchResult('polling', snapshot.seenJobs.length, 'system-disabled');
    }

    const feedJobs = new Map<string, JobRecord>();
    const activeMonitoring = monitoring.filter(
        (adapter) => adapter.resolveFeeds(settings).length > 0
    );

    if (activeMonitoring.length === 0) {
        await storage.touchLastCheck(`${reason}:no-platforms`);
        await storage.patchRuntimeState({
            lastPollingReason: reason,
            lastMonitoringAttemptAt: attemptedAt,
            lastMonitoringErrors: {},
        });
        return createNoopJobBatchResult('polling', snapshot.seenJobs.length, 'no-platforms');
    }

    const successfulPlatforms = new Set<PlatformId>();

    const feedFetchOptions = isManualScan ? { timeoutMs: MANUAL_SCAN_FETCH_TIMEOUT_MS } : undefined;

    await Promise.all(
        activeMonitoring.map(async (adapter) => {
            const feeds = adapter.resolveFeeds(settings);
            const results = await Promise.all(
                feeds.map((url) => fetchPlatformFeedJobsResult(adapter, url, feedFetchOptions))
            );

            for (const result of results) {
                if (result.kind !== 'success') {
                    monitoringErrors[adapter.id] = {
                        message: `${adapter.displayName}: ${result.reason}`,
                        failedAt: attemptedAt,
                    };
                    continue;
                }

                successfulPlatforms.add(adapter.id);

                for (const job of result.jobs) {
                    const jobWithPlatform = {
                        ...job,
                        platformId: job.platformId ?? adapter.id,
                    } satisfies JobRecord;
                    const jobKey = getJobRecordKey(jobWithPlatform);

                    feedJobs.set(jobKey, {
                        ...feedJobs.get(jobKey),
                        ...jobWithPlatform,
                    });
                }
            }
        })
    );

    if (successfulPlatforms.size === 0) {
        await storage.patchRuntimeState({
            lastPollingReason: `${reason}:fetch-failed`,
            lastMonitoringAttemptAt: attemptedAt,
            lastMonitoringErrors: monitoringErrors,
        });
        return createFailedJobBatchResult(
            'polling',
            snapshot.seenJobs.length,
            'fetch-failed',
            monitoringErrors
        );
    }

    const monitoringById = new Map<PlatformId, PlatformMonitoringAdapter>(
        activeMonitoring.map((adapter) => [adapter.id, adapter])
    );
    const feedJobList = [...feedJobs.values()];
    const eligibleJobs = new Map(feedJobList.map((job) => [getJobRecordKey(job), job]));
    const staleKhamsatJobs: JobRecord[] = [];
    const unseenCandidates = await storage.getUnseenJobs(feedJobList);
    const freshnessNow = new Date(attemptedAt);
    const hydrationDeadline = isManualScan
        ? Math.min(scanDeadline, Date.now() + MANUAL_SCAN_HYDRATION_BUDGET_MS)
        : Infinity;
    const khamsatCandidates = unseenCandidates.filter(
        (job) => resolveJobPlatformId(job) === 'khamsat'
    );

    if (isManualScan && khamsatCandidates.length > 0) {
        const monitoringAdapter = monitoringById.get('khamsat');
        const hydrationResults = await mapConcurrent(
            khamsatCandidates,
            MANUAL_SCAN_CONCURRENCY,
            async (job) => {
                const jobKey = getJobRecordKey(job);
                const remainingBudget = hydrationDeadline - Date.now();
                if (remainingBudget <= 200) {
                    return { jobKey, job, status: 'retry' as const };
                }
                const timeoutMs = Math.min(MANUAL_SCAN_FETCH_TIMEOUT_MS, remainingBudget);
                const hydrated = monitoringAdapter
                    ? await hydratePlatformJob(monitoringAdapter, job, { timeoutMs })
                    : job;
                const freshness = classifyKhamsatFreshness(hydrated, freshnessNow);
                return { jobKey, job: hydrated, status: freshness };
            }
        );

        for (const res of hydrationResults) {
            if (res.status === 'fresh') {
                eligibleJobs.set(res.jobKey, res.job);
            } else {
                eligibleJobs.delete(res.jobKey);
                if (res.status === 'stale') {
                    staleKhamsatJobs.push(res.job);
                } else if (res.status !== 'retry') {
                    monitoringErrors.khamsat = {
                        message: `Khamsat: missing publish date after detail hydration for job ${res.job.id}.`,
                        failedAt: attemptedAt,
                    };
                }
            }
        }
    } else {
        for (const job of khamsatCandidates) {
            const jobKey = getJobRecordKey(job);
            const monitoringAdapter = monitoringById.get('khamsat');
            let hydrated = job;
            if (monitoringAdapter) {
                if (monitoringAdapter.hydrationDelayMs) {
                    const last = lastHydrationTime.get('khamsat') ?? 0;
                    const elapsed = Date.now() - last;
                    if (elapsed < monitoringAdapter.hydrationDelayMs) {
                        await delay(monitoringAdapter.hydrationDelayMs - elapsed);
                    }
                }
                hydrated = await hydratePlatformJob(monitoringAdapter, job);
                lastHydrationTime.set('khamsat', Date.now());
            }
            const freshness = classifyKhamsatFreshness(hydrated, freshnessNow);

            if (freshness === 'fresh') {
                eligibleJobs.set(jobKey, hydrated);
                continue;
            }

            eligibleJobs.delete(jobKey);

            if (freshness === 'stale') {
                staleKhamsatJobs.push(hydrated);
                continue;
            }

            monitoringErrors.khamsat = {
                message: `Khamsat: missing publish date after detail hydration for job ${job.id}.`,
                failedAt: attemptedAt,
            };
        }
    }

    if (staleKhamsatJobs.length > 0) {
        await storage.rememberJobsWithoutStats(staleKhamsatJobs);
    }

    const ingested = await storage.ingestJobs([...eligibleJobs.values()]);
    await storage.patchRuntimeState({
        lastPollingReason: reason,
        lastMonitoringAttemptAt: attemptedAt,
        lastMonitoringSuccessAt: attemptedAt,
        lastMonitoringErrors: monitoringErrors,
    });

    const jobsByPlatform = new Map<PlatformId, JobRecord[]>();
    for (const job of ingested.newJobs) {
        const platformId = resolveJobPlatformId(job);
        const list = jobsByPlatform.get(platformId) ?? [];
        list.push(job);
        jobsByPlatform.set(platformId, list);
    }

    const platformHydrationResults = await Promise.all(
        [...jobsByPlatform.entries()].map(async ([platformId, jobs]) => {
            const monitoringAdapter = monitoringById.get(platformId);

            if (isManualScan) {
                const hydratedList = await mapConcurrent(
                    jobs,
                    MANUAL_SCAN_CONCURRENCY,
                    async (job, index) => {
                        if (platformId === 'khamsat' || !monitoringAdapter) {
                            return job;
                        }
                        if (index >= MAX_MANUAL_SCAN_SYNC_HYDRATION_PER_PLATFORM) {
                            return job;
                        }
                        const remainingBudget = hydrationDeadline - Date.now();
                        if (remainingBudget <= 200) {
                            return job;
                        }
                        const timeoutMs = Math.min(MANUAL_SCAN_FETCH_TIMEOUT_MS, remainingBudget);
                        return hydratePlatformJob(monitoringAdapter, job, { timeoutMs });
                    }
                );
                return hydratedList.filter((hydrated) => applyJobFilters(hydrated, settings));
            }

            const platformHydrated: JobRecord[] = [];

            for (const job of jobs) {
                let hydrated = job;

                if (platformId !== 'khamsat' && monitoringAdapter) {
                    if (monitoringAdapter.hydrationDelayMs) {
                        const last = lastHydrationTime.get(platformId) ?? 0;
                        const elapsed = Date.now() - last;
                        if (elapsed < monitoringAdapter.hydrationDelayMs) {
                            await delay(monitoringAdapter.hydrationDelayMs - elapsed);
                        }
                    }
                    hydrated = await hydratePlatformJob(monitoringAdapter, job);
                    lastHydrationTime.set(platformId, Date.now());
                }

                if (applyJobFilters(hydrated, settings)) {
                    platformHydrated.push(hydrated);
                }
            }

            return platformHydrated;
        })
    );

    const hydratedJobs = platformHydrationResults.flat();

    if (hydratedJobs.length > 0) {
        await storage.mergeRecentJobs(hydratedJobs);
    }

    if (isManualScan && jobsByPlatform.size > 0) {
        const partiallyHydrated = hydratedJobs.filter(
            (job) =>
                resolveJobPlatformId(job) !== 'khamsat' &&
                (!job.description || job.budget === 'غير محدد')
        );
        if (partiallyHydrated.length > 0) {
            void Promise.resolve()
                .then(async () => {
                    const backgroundUpdated = await mapConcurrent(
                        partiallyHydrated,
                        2,
                        async (job) => {
                            const adapter = monitoringById.get(resolveJobPlatformId(job));
                            return adapter ? hydratePlatformJob(adapter, job) : job;
                        }
                    );
                    await storage.mergeRecentJobs(backgroundUpdated);
                })
                .catch((error) => {
                    console.warn('[monitoring] background hydration error:', error);
                });
        }
    }

    return publishJobBatch({
        source: 'polling',
        jobs: hydratedJobs,
        totalChecked: ingested.seenJobs.length,
        settings,
        notificationsEnabled: ingested.notificationsEnabled,
        notifyJobs,
        playNotificationSound,
    });
}
