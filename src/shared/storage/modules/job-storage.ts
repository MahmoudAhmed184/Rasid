import { MAX_RECENT_JOBS } from '../schema';
import type { JobRecord, ProjectAttachment } from '../../../entities/job/model';
import { inferSupportedPlatformIdFromUrl, isPlatformId } from '../../../entities/platform/model';
import { getJobRecordKey } from '../../../entities/job/identity';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function normalizeText(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

export function normalizeOptionalText(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function cloneAttachments(
    value: readonly ProjectAttachment[] | undefined
): ProjectAttachment[] | undefined {
    return value?.map((attachment) => ({ ...attachment }));
}

export function normalizeAttachments(value: unknown): ProjectAttachment[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const attachments = value
        .filter((attachment): attachment is Record<string, unknown> => isObject(attachment))
        .map((attachment) => ({
            name: normalizeText(attachment.name),
            url: normalizeText(attachment.url),
        }))
        .filter((attachment) => attachment.url.length > 0);

    return attachments.length > 0 ? attachments : undefined;
}

export function normalizeJob(value: unknown): JobRecord | null {
    if (!isObject(value)) {
        return null;
    }

    const id = normalizeText(value.id);
    const title = normalizeText(value.title);
    const url = normalizeText(value.url);

    if (!id || !title || !url) {
        return null;
    }

    const platformId = isPlatformId(value.platformId)
        ? value.platformId
        : inferSupportedPlatformIdFromUrl(url);

    if (!platformId) {
        return null;
    }

    return {
        id,
        title,
        url,
        platformId,
        budget: normalizeOptionalText(value.budget),
        description: normalizeOptionalText(value.description),
        duration: normalizeOptionalText(value.duration),
        hiringRate: normalizeOptionalText(value.hiringRate),
        registrationDate: normalizeOptionalText(value.registrationDate),
        status: normalizeOptionalText(value.status),
        communications: normalizeOptionalText(value.communications),
        poster: normalizeOptionalText(value.poster),
        time: normalizeOptionalText(value.time),
        postedAt: normalizeOptionalText(value.postedAt),
        lastInteractionAt: normalizeOptionalText(value.lastInteractionAt),
        bidsText: normalizeOptionalText(value.bidsText),
        category: normalizeOptionalText(value.category),
        clientName: normalizeOptionalText(value.clientName),
        clientType: normalizeOptionalText(value.clientType),
        tags: Array.isArray(value.tags)
            ? value.tags.map((tag) => String(tag)).filter(Boolean)
            : undefined,
        attachments: normalizeAttachments(value.attachments),
    };
}

export function normalizeJobs(value: unknown): JobRecord[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((job) => normalizeJob(job)).filter((job): job is JobRecord => Boolean(job));
}

export function sortJobs(jobs: JobRecord[]): JobRecord[] {
    return [...jobs].sort((left, right) => {
        const leftId = Number(left.id);
        const rightId = Number(right.id);

        if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
            return rightId - leftId;
        }

        return right.url.localeCompare(left.url);
    });
}

export function mergeJobs(existing: JobRecord[], incoming: JobRecord[]): JobRecord[] {
    const jobsById = new Map(existing.map((job) => [getJobRecordKey(job), job]));

    for (const job of incoming) {
        if (!job.id) {
            continue;
        }

        const jobKey = getJobRecordKey(job);

        jobsById.set(jobKey, {
            ...jobsById.get(jobKey),
            ...job,
        });
    }

    return sortJobs([...jobsById.values()]).slice(0, MAX_RECENT_JOBS);
}
