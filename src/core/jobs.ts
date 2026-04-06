import { MOSTAQL_FEEDS, type ExtensionSettings, type JobCategory, type JobRecord } from '../models/extension';
import type { DomService } from './dom';
import type { ExtensionStorage } from './storage';

export interface JobNotifier {
    (jobs: JobRecord[]): Promise<unknown>;
}

export interface JobProcessingResult {
    success: boolean;
    source: 'signalr' | 'polling';
    newJobs: number;
    totalChecked: number;
    suppressed?: number;
}

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

function parseBudgetValue(budgetText?: string): number {
    if (!budgetText) {
        return 0;
    }

    const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);

    if (!matches) {
        return 0;
    }

    return Math.max(...matches.map((value) => Number(value)));
}

function parseHiringRate(rateText?: string): number {
    if (!rateText || rateText.includes('بعد')) {
        return 0;
    }

    const match = rateText.replace(/,/g, '').match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : 0;
}

function parseDurationDays(durationText?: string): number {
    if (!durationText) {
        return 0;
    }

    const match = durationText.match(/\d+/);

    if (match) {
        return Number(match[0]);
    }

    if (durationText.includes('يوم واحد')) {
        return 1;
    }

    return 0;
}

function calculateClientAgeDays(dateText?: string): number {
    if (!dateText) {
        return -1;
    }

    const arabicMonths: Record<string, number> = {
        يناير: 0,
        فبراير: 1,
        مارس: 2,
        أبريل: 3,
        مايو: 4,
        يونيو: 5,
        يوليو: 6,
        أغسطس: 7,
        سبتمبر: 8,
        أكتوبر: 9,
        نوفمبر: 10,
        ديسمبر: 11,
    };

    const parts = dateText.split(' ');

    if (parts.length < 3) {
        return -1;
    }

    const day = Number(parts[0]);
    const month = arabicMonths[parts[1] ?? ''];
    const year = Number(parts[2]);

    if (!Number.isFinite(day) || !Number.isFinite(year) || typeof month === 'undefined') {
        return -1;
    }

    const registeredAt = new Date(year, month, day);
    const diff = Math.abs(Date.now() - registeredAt.getTime());
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function isQuietHour(settings: ExtensionSettings): boolean {
    if (!settings.quietHoursStart || !settings.quietHoursEnd) {
        return false;
    }

    const [startHour, startMinute] = settings.quietHoursStart.split(':').map(Number);
    const [endHour, endMinute] = settings.quietHoursEnd.split(':').map(Number);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

export function applyFilters(job: JobRecord, settings: ExtensionSettings): boolean {
    if (settings.minBudget > 0) {
        const budgetValue = parseBudgetValue(job.budget);
        if (budgetValue > 0 && budgetValue < settings.minBudget) {
            return false;
        }
    }

    if (settings.minHiringRate > 0) {
        const hiringRateValue = parseHiringRate(job.hiringRate);
        if (hiringRateValue < settings.minHiringRate) {
            return false;
        }
    }

    if (settings.keywordsInclude.trim()) {
        const includeTerms = settings.keywordsInclude
            .toLowerCase()
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        const text = `${job.title} ${job.description ?? ''}`.toLowerCase();

        if (!includeTerms.some((term) => text.includes(term))) {
            return false;
        }
    }

    if (settings.keywordsExclude.trim()) {
        const excludeTerms = settings.keywordsExclude
            .toLowerCase()
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        const text = `${job.title} ${job.description ?? ''}`.toLowerCase();

        if (excludeTerms.some((term) => text.includes(term))) {
            return false;
        }
    }

    if (settings.maxDuration > 0) {
        const durationDays = parseDurationDays(job.duration);
        if (durationDays > 0 && durationDays > settings.maxDuration) {
            return false;
        }
    }

    if (settings.minClientAge > 0) {
        const ageDays = calculateClientAgeDays(job.registrationDate);
        if (ageDays >= 0 && ageDays < settings.minClientAge) {
            return false;
        }
    }

    return true;
}

async function fetchHtml(url: string): Promise<string | null> {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ar,en;q=0.9',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        },
    });

    if (!response.ok) {
        return null;
    }

    return response.text();
}

async function fetchFeedJobs(url: string, dom: DomService): Promise<JobRecord[]> {
    const html = await fetchHtml(`${url}${url.includes('?') ? '&' : '?'}_cb=${Date.now()}`);

    if (!html || html.includes('Cloudflare') || html.includes('challenge-platform')) {
        return [];
    }

    return dom.parseJobs(html);
}

async function hydrateJob(job: JobRecord, dom: DomService): Promise<JobRecord> {
    const html = await fetchHtml(job.url);

    if (!html) {
        return job;
    }

    const details = await dom.parseProjectDetails(html);

    return {
        ...job,
        ...(details ?? {}),
    };
}

function resolveEnabledFeeds(
    settings: ExtensionSettings
): Array<[JobCategory, string]> {
    if (settings.all !== false) {
        return [['all', MOSTAQL_FEEDS.all]];
    }

    return (Object.entries(MOSTAQL_FEEDS) as Array<[JobCategory, string]>).filter(
        ([category]) => settings[category] !== false
    );
}

export async function processRealtimeJobBatch(options: {
    jobs: JobRecord[];
    storage: ExtensionStorage;
    notifyJobs: JobNotifier;
    playNotificationSound?: () => Promise<void>;
}): Promise<JobProcessingResult> {
    const { jobs, storage, notifyJobs, playNotificationSound } = options;
    const snapshot = await storage.getSnapshot();

    if (snapshot.settings.systemEnabled === false) {
        await storage.touchLastCheck('signalr-disabled');

        return {
            success: true,
            source: 'signalr',
            newJobs: 0,
            totalChecked: snapshot.seenJobs.length,
        };
    }

    const candidates = jobs
        .map((job) => normalizeJobRecord(job))
        .filter((job): job is JobRecord => Boolean(job))
        .filter((job) => applyFilters(job, snapshot.settings));

    const ingested = await storage.ingestJobs(candidates);

    if (ingested.newJobs.length === 0) {
        return {
            success: true,
            source: 'signalr',
            newJobs: 0,
            totalChecked: ingested.seenJobs.length,
        };
    }

    if (snapshot.settings.quietHoursEnabled && isQuietHour(snapshot.settings)) {
        return {
            success: true,
            source: 'signalr',
            newJobs: 0,
            totalChecked: ingested.seenJobs.length,
            suppressed: ingested.newJobs.length,
        };
    }

    if (ingested.notificationsEnabled) {
        await notifyJobs(ingested.newJobs);
        if (snapshot.settings.sound) {
            await playNotificationSound?.();
        }
    }

    return {
        success: true,
        source: 'signalr',
        newJobs: ingested.newJobs.length,
        totalChecked: ingested.seenJobs.length,
    };
}

export async function runPollingCycle(options: {
    storage: ExtensionStorage;
    notifyJobs: JobNotifier;
    reason: string;
    dom: DomService;
    playNotificationSound?: () => Promise<void>;
}): Promise<JobProcessingResult> {
    const { storage, notifyJobs, reason, dom, playNotificationSound } = options;
    const snapshot = await storage.getSnapshot();
    const settings = snapshot.settings;

    if (settings.systemEnabled === false) {
        await storage.touchLastCheck(`${reason}:disabled`);

        return {
            success: true,
            source: 'polling',
            newJobs: 0,
            totalChecked: snapshot.seenJobs.length,
        };
    }

    const feedJobs = new Map<string, JobRecord>();

    for (const [_category, url] of resolveEnabledFeeds(settings)) {
        for (const job of await fetchFeedJobs(url, dom)) {
            feedJobs.set(job.id, {
                ...feedJobs.get(job.id),
                ...job,
            });
        }
    }

    const ingested = await storage.ingestJobs([...feedJobs.values()]);
    await storage.patchRuntimeState({ lastPollingReason: reason });

    if (ingested.newJobs.length === 0) {
        return {
            success: true,
            source: 'polling',
            newJobs: 0,
            totalChecked: ingested.seenJobs.length,
        };
    }

    const hydratedJobs: JobRecord[] = [];

    for (const job of ingested.newJobs) {
        const hydrated = await hydrateJob(job, dom);

        if (applyFilters(hydrated, settings)) {
            hydratedJobs.push(hydrated);
        }
    }

    if (hydratedJobs.length > 0) {
        await storage.mergeRecentJobs(hydratedJobs);
    }

    if (settings.quietHoursEnabled && isQuietHour(settings)) {
        return {
            success: true,
            source: 'polling',
            newJobs: 0,
            totalChecked: ingested.seenJobs.length,
            suppressed: hydratedJobs.length,
        };
    }

    if (ingested.notificationsEnabled && hydratedJobs.length > 0) {
        await notifyJobs(hydratedJobs);
        if (settings.sound) {
            await playNotificationSound?.();
        }
    }

    return {
        success: true,
        source: 'polling',
        newJobs: hydratedJobs.length,
        totalChecked: ingested.seenJobs.length,
    };
}

export async function debugFetchMostaql(): Promise<{ success: boolean; length?: number; error?: string }> {
    try {
        const html = await fetchHtml(MOSTAQL_FEEDS.all);

        if (!html) {
            return {
                success: false,
                error: 'Unable to fetch Mostaql listing HTML.',
            };
        }

        return {
            success: true,
            length: html.length,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
