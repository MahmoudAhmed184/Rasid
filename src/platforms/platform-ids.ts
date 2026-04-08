export const PLATFORM_IDS = [
    'mostaql',
    'khamsat',
    'nafezly',
    'kafiil',
    'freelancer',
    'upwork',
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export const PLATFORM_DISPLAY_NAMES: Record<PlatformId, string> = {
    mostaql: 'مستقل',
    khamsat: 'خمسات',
    nafezly: 'نفذلي',
    kafiil: 'كفيل',
    freelancer: 'Freelancer',
    upwork: 'Upwork',
};

export function isPlatformId(value: unknown): value is PlatformId {
    return typeof value === 'string' && PLATFORM_IDS.includes(value as PlatformId);
}

export function inferPlatformIdFromUrl(url: string | undefined, fallback: PlatformId): PlatformId {
    if (!url) {
        return fallback;
    }

    try {
        const hostname = new URL(url).hostname.toLowerCase();

        if (hostname.includes('khamsat.com')) {
            return 'khamsat';
        }

        if (hostname.includes('mostaql.com')) {
            return 'mostaql';
        }

        if (hostname.includes('nafezly.com')) {
            return 'nafezly';
        }

        if (hostname.includes('kafiil.com')) {
            return 'kafiil';
        }

        if (hostname.includes('freelancer.com')) {
            return 'freelancer';
        }

        if (hostname.includes('upwork.com')) {
            return 'upwork';
        }
    } catch {
        return fallback;
    }

    return fallback;
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
