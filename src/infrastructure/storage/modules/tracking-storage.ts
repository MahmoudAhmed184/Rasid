import type { StorageClient } from '../storage-client';
import { STORAGE_FIELDS } from '../storage-keys';
import type { TrackedProject } from '../../../models/jobs';
import { parseQualifiedProjectKey } from '../../../shared/jobs/job-identity';
import { resolvePlatformId } from '../../../platforms/platform-ids';
import {
    cloneAttachments,
    normalizeAttachments,
    normalizeOptionalText,
    normalizeText,
} from './job-storage';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function cloneTrackedProjects(
    value: Readonly<Record<string, TrackedProject>>
): Record<string, TrackedProject> {
    return Object.fromEntries(
        Object.entries(value).map(([id, project]) => [
            id,
            {
                ...project,
                attachments: cloneAttachments(project.attachments),
            },
        ])
    );
}

export function normalizeTrackedProjects(value: unknown): Record<string, TrackedProject> {
    if (!isObject(value)) {
        return {};
    }

    const trackedProjects = Object.entries(value)
        .map(([storageKey, project]) => {
            const record = isObject(project) ? project : {};
            const url = normalizeText(record.url);
            const keyIdentity = parseQualifiedProjectKey(storageKey);
            const normalizedId = normalizeText(record.id) || keyIdentity?.id || storageKey;

            return [
                storageKey,
                {
                    id: normalizedId,
                    platformId: resolvePlatformId(record.platformId, {
                        url,
                        fallback: keyIdentity?.platformId,
                    }),
                    title: normalizeText(record.title),
                    url,
                    status: normalizeOptionalText(record.status),
                    communications: normalizeOptionalText(record.communications),
                    lastChecked: normalizeOptionalText(record.lastChecked),
                    budget: normalizeOptionalText(record.budget),
                    duration: normalizeOptionalText(record.duration),
                    publishDate: normalizeOptionalText(record.publishDate),
                    clientName: normalizeOptionalText(record.clientName),
                    tags: normalizeOptionalText(record.tags),
                    category: normalizeOptionalText(record.category),
                    hiringRate: normalizeOptionalText(record.hiringRate),
                    openProjects: normalizeOptionalText(record.openProjects),
                    underwayProjects: normalizeOptionalText(record.underwayProjects),
                    clientJoined: normalizeOptionalText(record.clientJoined),
                    clientType: normalizeOptionalText(record.clientType),
                    attachments: normalizeAttachments(record.attachments),
                },
            ] as const;
        })
        .filter(([, project]) => project.url.length > 0);

    return Object.fromEntries(trackedProjects);
}

export interface TrackingStorageModule {
    getTrackedProjects(): Promise<Record<string, TrackedProject>>;
    setTrackedProjects(
        projects: Record<string, TrackedProject>
    ): Promise<Record<string, TrackedProject>>;
}

export function createTrackingStorage(client: StorageClient): TrackingStorageModule {
    return {
        async getTrackedProjects() {
            const response = await client.get(STORAGE_FIELDS.trackedProjects);
            return cloneTrackedProjects(
                normalizeTrackedProjects(response[STORAGE_FIELDS.trackedProjects])
            );
        },
        async setTrackedProjects(projects) {
            const next = normalizeTrackedProjects(projects);
            await client.set({ [STORAGE_FIELDS.trackedProjects]: next });
            return cloneTrackedProjects(next);
        },
    };
}
