import type { ExtensionStorage } from '../extension-storage';
import type { TrackedProject } from '../../../models/jobs';
import type { PlatformId, TrackedProjectRecord } from '../../../platforms/contracts';
import {
    getTrackedProjectKey,
    parseQualifiedProjectKey,
    resolveTrackedProjectPlatformId,
} from '../../../shared/jobs/job-identity';

export interface TrackingRepository {
    list(): Promise<TrackedProjectRecord[]>;
    get(projectId: string, platformId: PlatformId): Promise<TrackedProjectRecord | null>;
    isTracked(projectId: string, platformId: PlatformId): Promise<boolean>;
    toggle(project: TrackedProjectRecord): Promise<'tracked' | 'untracked'>;
}

function toTrackedProjectRecord(
    storageKey: string,
    project: TrackedProject
): TrackedProjectRecord | null {
    if (!project.url) {
        return null;
    }

    const keyIdentity = parseQualifiedProjectKey(storageKey);
    const platformId = resolveTrackedProjectPlatformId({
        platformId: project.platformId ?? keyIdentity?.platformId,
        url: project.url,
    });

    return {
        id: project.id ?? keyIdentity?.id ?? storageKey,
        platformId,
        title: project.title,
        url: project.url,
        status: project.status,
        communications: project.communications,
        lastChecked: project.lastChecked,
        budget: project.budget,
        duration: project.duration,
        clientName: project.clientName,
        publishDate: project.publishDate,
        tags: project.tags,
        category: project.category,
        hiringRate: project.hiringRate,
        openProjects: project.openProjects,
        underwayProjects: project.underwayProjects,
        clientJoined: project.clientJoined,
        clientType: project.clientType,
        attachments: project.attachments?.map((attachment) => ({ ...attachment })),
    };
}

function toStoredTrackedProject(project: TrackedProjectRecord): TrackedProject {
    return {
        id: project.id,
        platformId: project.platformId,
        title: project.title,
        url: project.url,
        status: project.status,
        communications: project.communications,
        lastChecked: project.lastChecked,
        budget: project.budget,
        duration: project.duration,
        publishDate: project.publishDate,
        clientName: project.clientName,
        tags: project.tags,
        category: project.category,
        hiringRate: project.hiringRate,
        openProjects: project.openProjects,
        underwayProjects: project.underwayProjects,
        clientJoined: project.clientJoined,
        clientType: project.clientType,
        attachments: project.attachments?.map((attachment) => ({ ...attachment })),
    };
}

function findTrackedProjectMatches(
    trackedProjects: Record<string, TrackedProject>,
    projectId: string,
    platformId: PlatformId
): Array<{
    readonly storageKey: string;
    readonly record: TrackedProjectRecord;
}> {
    const matches: Array<{
        readonly storageKey: string;
        readonly record: TrackedProjectRecord;
    }> = [];

    for (const [storageKey, project] of Object.entries(trackedProjects)) {
        const record = toTrackedProjectRecord(storageKey, project);

        if (!record) {
            continue;
        }

        if (record.id === projectId && record.platformId === platformId) {
            matches.push({ storageKey, record });
        }
    }

    return matches;
}

export function createTrackingRepository(storage: ExtensionStorage): TrackingRepository {
    return {
        async list() {
            const trackedProjects = await storage.getTrackedProjects();
            const recordsByKey = new Map<string, TrackedProjectRecord>();

            for (const [storageKey, project] of Object.entries(trackedProjects)) {
                const record = toTrackedProjectRecord(storageKey, project);

                if (!record) {
                    continue;
                }

                const identityKey = getTrackedProjectKey(record);
                const hasQualifiedKey = parseQualifiedProjectKey(storageKey) !== null;

                if (!recordsByKey.has(identityKey) || hasQualifiedKey) {
                    recordsByKey.set(identityKey, record);
                }
            }

            return Array.from(recordsByKey.values());
        },
        async get(projectId, platformId) {
            const trackedProjects = await storage.getTrackedProjects();
            return findTrackedProjectMatches(trackedProjects, projectId, platformId)[0]?.record ?? null;
        },
        async isTracked(projectId, platformId) {
            const trackedProject = await this.get(projectId, platformId);
            return trackedProject !== null;
        },
        async toggle(project) {
            const trackedProjects = await storage.getTrackedProjects();
            const matches = findTrackedProjectMatches(
                trackedProjects,
                project.id,
                project.platformId
            );

            if (matches.length > 0) {
                const matchKeys = new Set(matches.map((match) => match.storageKey));
                const rest = Object.fromEntries(
                    Object.entries(trackedProjects).filter(
                        ([storageKey]) => !matchKeys.has(storageKey)
                    )
                );
                await storage.setTrackedProjects(rest);
                return 'untracked';
            }

            const storageKey = getTrackedProjectKey(project);

            await storage.setTrackedProjects({
                ...trackedProjects,
                [storageKey]: toStoredTrackedProject(project),
            });

            return 'tracked';
        },
    };
}
