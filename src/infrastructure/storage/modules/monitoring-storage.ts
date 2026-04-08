import { DEFAULT_STATS, MAX_RECENT_JOBS, MAX_SEEN_JOBS, type StoredState } from '../schema';
import type { StorageClient } from '../storage-client';
import { STORAGE_FIELDS } from '../storage-keys';
import type { JobRecord } from '../../../models/jobs';
import type { ExtensionStats } from '../../../models/monitoring';
import type { RuntimeState } from '../../../models/runtime';
import type { ExtensionSettings } from '../../../models/settings';
import { getJobRecordKey } from '../../../shared/jobs/job-identity';
import { mergeJobs, normalizeJobs, sortJobs } from './job-storage';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export interface IngestedJobsResult {
    newJobs: JobRecord[];
    seenJobs: string[];
    recentJobs: JobRecord[];
    stats: ExtensionStats;
    settings: ExtensionSettings;
    notificationsEnabled: boolean;
}

export function normalizeStats(value: unknown): ExtensionStats {
    if (!isObject(value)) {
        return { ...DEFAULT_STATS };
    }

    return {
        lastCheck: typeof value.lastCheck === 'string' ? value.lastCheck : null,
        todayCount: Number.isFinite(value.todayCount) ? Number(value.todayCount) : 0,
        todayDate:
            typeof value.todayDate === 'string' && value.todayDate.length > 0
                ? value.todayDate
                : new Date().toDateString(),
    };
}

export function normalizeSeenJobs(value: unknown): string[] {
    return Array.isArray(value)
        ? value
              .map((item) => String(item))
              .filter(Boolean)
              .slice(-MAX_SEEN_JOBS)
        : [];
}

export function normalizeMonitoringFields(
    value: Record<string, unknown>
): Pick<StoredState, 'seenJobs' | 'recentJobs' | 'stats'> {
    return {
        seenJobs: normalizeSeenJobs(value.seenJobs),
        recentJobs: sortJobs(normalizeJobs(value.recentJobs)).slice(0, MAX_RECENT_JOBS),
        stats: normalizeStats(value.stats),
    };
}

function resetDailyStats(stats: ExtensionStats): ExtensionStats {
    if (stats.todayDate === new Date().toDateString()) {
        return stats;
    }

    return {
        ...stats,
        todayCount: 0,
        todayDate: new Date().toDateString(),
    };
}

export interface MonitoringStorageModule {
    ingestJobs(snapshot: StoredState, jobs: JobRecord[]): Promise<IngestedJobsResult>;
    mergeRecentJobs(jobs: JobRecord[]): Promise<JobRecord[]>;
    touchLastCheck(runtime: RuntimeState, reason: string): Promise<ExtensionStats>;
}

export function createMonitoringStorage(client: StorageClient): MonitoringStorageModule {
    return {
        async ingestJobs(snapshot, jobs) {
            const seenJobs = new Set(snapshot.seenJobs);
            const newJobs: JobRecord[] = [];

            for (const job of jobs) {
                const jobKey = getJobRecordKey(job);

                if (!job.id || seenJobs.has(jobKey)) {
                    continue;
                }

                seenJobs.add(jobKey);
                newJobs.push(job);
            }

            const recentJobs = mergeJobs(snapshot.recentJobs, jobs);
            const stats = resetDailyStats(snapshot.stats);
            stats.lastCheck = new Date().toISOString();
            stats.todayCount += newJobs.length;

            const nextSeenJobs = [...seenJobs].slice(-MAX_SEEN_JOBS);

            await client.set({
                [STORAGE_FIELDS.seenJobs]: nextSeenJobs,
                [STORAGE_FIELDS.recentJobs]: recentJobs,
                [STORAGE_FIELDS.stats]: stats,
            });

            return {
                newJobs,
                seenJobs: nextSeenJobs,
                recentJobs,
                stats,
                settings: snapshot.settings,
                notificationsEnabled: snapshot.notificationsEnabled,
            };
        },
        async mergeRecentJobs(jobs) {
            const response = await client.get(STORAGE_FIELDS.recentJobs);
            const currentJobs = sortJobs(normalizeJobs(response[STORAGE_FIELDS.recentJobs]));
            const recentJobs = mergeJobs(currentJobs, jobs);

            await client.set({ [STORAGE_FIELDS.recentJobs]: recentJobs });
            return recentJobs;
        },
        async touchLastCheck(runtime, reason) {
            const response = await client.get(STORAGE_FIELDS.stats);
            const stats = resetDailyStats(normalizeStats(response[STORAGE_FIELDS.stats]));
            stats.lastCheck = new Date().toISOString();

            await client.set({
                [STORAGE_FIELDS.stats]: stats,
                [STORAGE_FIELDS.runtime]: {
                    ...runtime,
                    lastPollingReason: reason,
                },
            });

            return stats;
        },
    };
}
