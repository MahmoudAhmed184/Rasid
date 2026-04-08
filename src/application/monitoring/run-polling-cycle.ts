import { applyJobFilters } from './job-filters';
import { fetchPlatformFeedJobs, hydratePlatformJob } from './fetch-platform-html';
import {
    createNoopJobBatchResult,
    publishJobBatch,
    type JobBatchResult,
    type JobNotifier,
} from './job-batch-publisher';
import type { ExtensionStorage } from '../../infrastructure/storage/extension-storage';
import type { JobRecord } from '../../models/jobs';
import type { PlatformMonitoringAdapter } from '../../platforms/contracts';
import type { PlatformId } from '../../platforms/platform-ids';
import { getJobRecordKey, resolveJobPlatformId } from '../../shared/jobs/job-identity';

export async function runPollingCycle(options: {
    storage: ExtensionStorage;
    notifyJobs: JobNotifier;
    reason: string;
    monitoring: readonly PlatformMonitoringAdapter[];
    playNotificationSound?: () => Promise<void>;
}): Promise<JobBatchResult> {
    const { storage, notifyJobs, reason, monitoring, playNotificationSound } = options;
    const snapshot = await storage.getSnapshot();
    const settings = snapshot.settings;

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
        await storage.patchRuntimeState({ lastPollingReason: reason });
        return createNoopJobBatchResult('polling', snapshot.seenJobs.length, 'no-platforms');
    }

    for (const adapter of activeMonitoring) {
        for (const url of adapter.resolveFeeds(settings)) {
            for (const job of await fetchPlatformFeedJobs(adapter, url)) {
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
    }

    const ingested = await storage.ingestJobs([...feedJobs.values()]);
    await storage.patchRuntimeState({ lastPollingReason: reason });

    const hydratedJobs: JobRecord[] = [];
    const monitoringById = new Map<PlatformId, PlatformMonitoringAdapter>(
        activeMonitoring.map((adapter) => [adapter.id, adapter])
    );

    for (const job of ingested.newJobs) {
        const monitoringAdapter = monitoringById.get(resolveJobPlatformId(job));
        const hydrated = monitoringAdapter ? await hydratePlatformJob(monitoringAdapter, job) : job;

        if (applyJobFilters(hydrated, settings)) {
            hydratedJobs.push(hydrated);
        }
    }

    if (hydratedJobs.length > 0) {
        await storage.mergeRecentJobs(hydratedJobs);
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
