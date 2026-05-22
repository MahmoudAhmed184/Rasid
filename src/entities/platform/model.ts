import { isAllowedPlatformHostname } from './url';

export const PLATFORM_IDS = ['mostaql', 'khamsat', 'nafezly'] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export const PLATFORM_DISPLAY_NAMES: Record<PlatformId, string> = {
    mostaql: 'مستقل',
    khamsat: 'خمسات',
    nafezly: 'نفذلي',
};

const PLATFORM_HOSTS: Record<PlatformId, readonly string[]> = {
    mostaql: ['mostaql.com'],
    khamsat: ['khamsat.com'],
    nafezly: ['nafezly.com'],
};

export interface PlatformAutofillDraft {
    readonly platformId: PlatformId;
    readonly projectId: string;
    readonly proposal: string;
    readonly amount: number;
    readonly durationDays: number;
    readonly createdAt: number;
}

export function isPlatformId(value: unknown): value is PlatformId {
    return typeof value === 'string' && PLATFORM_IDS.includes(value as PlatformId);
}

export function inferSupportedPlatformIdFromUrl(url: string | undefined): PlatformId | null {
    if (!url) {
        return null;
    }

    try {
        const hostname = new URL(url).hostname.toLowerCase();

        for (const platformId of PLATFORM_IDS) {
            if (isAllowedPlatformHostname(hostname, PLATFORM_HOSTS[platformId])) {
                return platformId;
            }
        }
    } catch {
        return null;
    }

    return null;
}

export function inferPlatformIdFromUrl(url: string | undefined, fallback: PlatformId): PlatformId {
    return inferSupportedPlatformIdFromUrl(url) ?? fallback;
}

export function resolvePlatformId(
    value: unknown,
    options: {
        readonly url?: string;
        readonly fallback?: PlatformId;
    } = {}
): PlatformId {
    if (isPlatformId(value)) {
        return value;
    }

    return inferPlatformIdFromUrl(options.url, options.fallback ?? 'mostaql');
}

export function getPlatformDisplayName(platformId: PlatformId): string {
    return PLATFORM_DISPLAY_NAMES[platformId];
}
