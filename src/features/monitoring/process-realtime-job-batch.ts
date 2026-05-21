import { applyJobFilters } from './job-filters';
import {
    createNoopJobBatchResult,
    publishJobBatch,
    type JobBatchResult,
    type JobNotifier,
} from './job-batch-publisher';
import { normalizeJobRecord } from './job-records';
import type { JobRecord } from '../../entities/job/model';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import { isPlatformMonitoringEnabled } from '../../entities/settings/model';
import { resolveJobPlatformId } from '../../entities/job/identity';

export async function processRealtimeJobBatch(options: {
    jobs: readonly JobRecord[];
    storage: ExtensionStorage;
    notifyJobs: JobNotifier;
    playNotificationSound?: () => Promise<void>;
}): Promise<JobBatchResult> {
    const { jobs, storage, notifyJobs, playNotificationSound } = options;
    const snapshot = await storage.getSnapshot();

    if (snapshot.settings.systemEnabled === false) {
        await storage.touchLastCheck('signalr-disabled');
        return createNoopJobBatchResult('signalr', snapshot.seenJobs.length, 'system-disabled');
    }

    const candidates = jobs
        .map((job) => normalizeJobRecord(job))
        .filter((job): job is JobRecord => Boolean(job))
        .filter((job) => isPlatformMonitoringEnabled(snapshot.settings, resolveJobPlatformId(job)))
        .filter((job) => applyJobFilters(job, snapshot.settings));

    const ingested = await storage.ingestJobs(candidates);

    return publishJobBatch({
        source: 'signalr',
        jobs: ingested.newJobs,
        totalChecked: ingested.seenJobs.length,
        settings: snapshot.settings,
        notificationsEnabled: ingested.notificationsEnabled,
        notifyJobs,
        playNotificationSound,
    });
}
