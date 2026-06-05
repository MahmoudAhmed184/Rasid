import { isQuietHour } from './job-filters';
import type { JobRecord } from '../../entities/job/model';
import type { ExtensionSettings } from '../../entities/settings/model';

export type JobBatchSource = 'signalr' | 'polling';
export type JobBatchNoopReason = 'system-disabled' | 'no-platforms' | 'no-new-jobs';
export type JobBatchFailedReason = 'fetch-failed';

export interface JobNotifier {
    (jobs: JobRecord[]): Promise<unknown>;
}

export type JobBatchResult =
    | {
          readonly kind: 'noop';
          readonly source: JobBatchSource;
          readonly reason: JobBatchNoopReason;
          readonly totalChecked: number;
      }
    | {
          readonly kind: 'failed';
          readonly source: JobBatchSource;
          readonly reason: JobBatchFailedReason;
          readonly totalChecked: number;
          readonly monitoringErrors: Record<string, { readonly message: string; readonly failedAt: string }>;
      }
    | {
          readonly kind: 'suppressed';
          readonly source: JobBatchSource;
          readonly suppressed: number;
          readonly totalChecked: number;
      }
    | {
          readonly kind: 'published';
          readonly source: JobBatchSource;
          readonly newJobs: number;
          readonly notificationsSent: boolean;
          readonly totalChecked: number;
      };

export function createNoopJobBatchResult(
    source: JobBatchSource,
    totalChecked: number,
    reason: JobBatchNoopReason
): JobBatchResult {
    return {
        kind: 'noop',
        source,
        reason,
        totalChecked,
    };
}

export function createFailedJobBatchResult(
    source: JobBatchSource,
    totalChecked: number,
    reason: JobBatchFailedReason,
    monitoringErrors: Record<string, { readonly message: string; readonly failedAt: string }>
): JobBatchResult {
    return {
        kind: 'failed',
        source,
        reason,
        totalChecked,
        monitoringErrors,
    };
}

export async function publishJobBatch(options: {
    readonly source: JobBatchSource;
    readonly jobs: readonly JobRecord[];
    readonly totalChecked: number;
    readonly settings: Readonly<ExtensionSettings>;
    readonly notificationsEnabled: boolean;
    readonly notifyJobs: JobNotifier;
    readonly playNotificationSound?: () => Promise<void>;
}): Promise<JobBatchResult> {
    const {
        source,
        jobs,
        totalChecked,
        settings,
        notificationsEnabled,
        notifyJobs,
        playNotificationSound,
    } = options;

    if (jobs.length === 0) {
        return createNoopJobBatchResult(source, totalChecked, 'no-new-jobs');
    }

    if (settings.quietHoursEnabled && isQuietHour(settings)) {
        return {
            kind: 'suppressed',
            source,
            suppressed: jobs.length,
            totalChecked,
        };
    }

    const notificationsSent = notificationsEnabled;

    if (notificationsSent) {
        await notifyJobs([...jobs]);

        if (settings.sound) {
            await playNotificationSound?.();
        }
    }

    return {
        kind: 'published',
        source,
        newJobs: jobs.length,
        notificationsSent,
        totalChecked,
    };
}
