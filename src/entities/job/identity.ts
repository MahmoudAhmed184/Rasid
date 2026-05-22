import type { JobRecord, TrackedProject } from './model';
import { isPlatformId, resolvePlatformId, type PlatformId } from '../platform/model';

export function resolveJobPlatformId(
    job: Pick<JobRecord, 'platformId' | 'url'>
): ReturnType<typeof resolvePlatformId> {
    return resolvePlatformId(job.platformId, {
        url: job.url,
    });
}

export function getJobRecordKey(job: Pick<JobRecord, 'id' | 'platformId' | 'url'>): string {
    return `${resolveJobPlatformId(job)}:${job.id}`;
}

export function resolveTrackedProjectPlatformId(
    project: Pick<TrackedProject, 'platformId' | 'url'>
): PlatformId {
    return resolvePlatformId(project.platformId, {
        url: project.url,
    });
}

export function createTrackedProjectKey(projectId: string, platformId: PlatformId): string {
    return `${platformId}:${projectId}`;
}

export function getTrackedProjectKey(
    project: Pick<TrackedProject, 'id' | 'platformId' | 'url'> & { id: string }
): string {
    return createTrackedProjectKey(project.id, resolveTrackedProjectPlatformId(project));
}

export function parseQualifiedProjectKey(key: string): {
    readonly platformId: PlatformId;
    readonly id: string;
} | null {
    const separatorIndex = key.indexOf(':');

    if (separatorIndex <= 0 || separatorIndex >= key.length - 1) {
        return null;
    }

    const platformId = key.slice(0, separatorIndex);

    if (!isPlatformId(platformId)) {
        return null;
    }

    return {
        platformId,
        id: key.slice(separatorIndex + 1),
    };
}
