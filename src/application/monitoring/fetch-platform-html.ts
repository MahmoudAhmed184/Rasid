import type { JobRecord } from '../../models/jobs';
import type { PlatformMonitoringAdapter } from '../../platforms/contracts';

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

function isChallengePage(html: string): boolean {
    const normalized = html.trim();

    return (
        normalized.length === 0 ||
        normalized.includes('Cloudflare') ||
        normalized.includes('challenge-platform') ||
        normalized.includes('Request blocked')
    );
}

export async function fetchPlatformFeedJobs(
    monitoring: PlatformMonitoringAdapter,
    url: string
): Promise<readonly JobRecord[]> {
    const html = await fetchHtml(`${url}${url.includes('?') ? '&' : '?'}_cb=${Date.now()}`);

    if (!html || isChallengePage(html)) {
        return [];
    }

    return monitoring.parseListingHtml(html);
}

export async function hydratePlatformJob(
    monitoring: PlatformMonitoringAdapter,
    job: Readonly<JobRecord>
): Promise<JobRecord> {
    const html = await fetchHtml(job.url);

    if (!html || isChallengePage(html)) {
        return { ...job };
    }

    return {
        ...job,
        ...((await monitoring.parseProjectHtml(html)) ?? {}),
    };
}

export async function debugFetchMonitoringSource(monitoring: PlatformMonitoringAdapter): Promise<{
    success: boolean;
    length?: number;
    error?: string;
}> {
    try {
        const html = await fetchHtml(monitoring.debugProbeUrl);

        if (!html || isChallengePage(html)) {
            return {
                success: false,
                error: `Unable to fetch monitoring listing HTML for ${monitoring.displayName}.`,
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

export async function debugFetchMonitoringSources(
    monitoring: readonly PlatformMonitoringAdapter[]
): Promise<{
    success: boolean;
    length?: number;
    error?: string;
}> {
    if (monitoring.length === 0) {
        return {
            success: false,
            error: 'No monitoring platforms are enabled.',
        };
    }

    const results = await Promise.all(
        monitoring.map((adapter) => debugFetchMonitoringSource(adapter))
    );
    const successes = results.filter((result) => result.success);

    if (successes.length > 0) {
        return {
            success: true,
            length: successes.reduce((total, result) => total + (result.length ?? 0), 0),
        };
    }

    return {
        success: false,
        error:
            results
                .map((result) => result.error)
                .filter(Boolean)
                .join(' | ') || 'Unable to fetch monitoring HTML.',
    };
}
