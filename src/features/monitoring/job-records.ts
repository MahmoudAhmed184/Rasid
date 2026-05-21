import type { JobRecord } from '../../entities/job/model';
import { resolvePlatformId } from '../../platforms/platform-ids';

export function normalizeJobRecord(value: unknown): JobRecord | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const record = value as Record<string, unknown>;
    const id = String(record.id ?? '');
    const title = String(record.title ?? '');
    const url = String(record.url ?? '');

    if (!id || !title || !url) {
        return null;
    }

    return {
        id,
        title,
        url,
        platformId: resolvePlatformId(record.platformId, { url }),
        budget: typeof record.budget === 'string' ? record.budget : undefined,
        description: typeof record.description === 'string' ? record.description : undefined,
        duration: typeof record.duration === 'string' ? record.duration : undefined,
        hiringRate: typeof record.hiringRate === 'string' ? record.hiringRate : undefined,
        registrationDate:
            typeof record.registrationDate === 'string' ? record.registrationDate : undefined,
        status: typeof record.status === 'string' ? record.status : undefined,
        communications:
            typeof record.communications === 'string' ? record.communications : undefined,
        poster: typeof record.poster === 'string' ? record.poster : undefined,
        time: typeof record.time === 'string' ? record.time : undefined,
        postedAt: typeof record.postedAt === 'string' ? record.postedAt : undefined,
        bidsText: typeof record.bidsText === 'string' ? record.bidsText : undefined,
        category: typeof record.category === 'string' ? record.category : undefined,
        clientName: typeof record.clientName === 'string' ? record.clientName : undefined,
        clientType: typeof record.clientType === 'string' ? record.clientType : undefined,
        tags: Array.isArray(record.tags)
            ? record.tags.map((tag) => String(tag)).filter(Boolean)
            : undefined,
    };
}
