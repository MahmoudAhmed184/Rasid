import type { JobRecord } from '../../entities/job/model';
import type { PlatformMonitoringAdapter } from '../../platforms/contracts';
import { detectChallengePage } from '../../shared/network/challenge-page';

type HtmlFetchResult =
    | {
          readonly kind: 'success';
          readonly html: string;
      }
    | {
          readonly kind: 'error';
          readonly reason: string;
      };

async function fetchHtml(url: string): Promise<HtmlFetchResult> {
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
        return {
            kind: 'error',
            reason: `Request failed with HTTP ${response.status}.`,
        };
    }

    const html = await response.text();
    if (!html.trim()) {
        return {
            kind: 'error',
            reason: 'Received an empty HTML document.',
        };
    }

    const challengeMatch = detectChallengePage(html);
    if (challengeMatch) {
        return {
            kind: 'error',
            reason: `Upstream challenge page detected (${challengeMatch.marker}).`,
        };
    }

    return {
        kind: 'success',
        html,
    };
}

export async function fetchPlatformFeedJobs(
    monitoring: PlatformMonitoringAdapter,
    url: string
): Promise<readonly JobRecord[]> {
    const result = await fetchHtml(`${url}${url.includes('?') ? '&' : '?'}_cb=${Date.now()}`);

    if (result.kind !== 'success') {
        return [];
    }

    return monitoring.parseListingHtml(result.html);
}

export async function hydratePlatformJob(
    monitoring: PlatformMonitoringAdapter,
    job: Readonly<JobRecord>
): Promise<JobRecord> {
    const result = await fetchHtml(job.url);

    if (result.kind !== 'success') {
        return { ...job };
    }

    return {
        ...job,
        ...((await monitoring.parseProjectHtml(result.html)) ?? {}),
    };
}

export async function debugFetchMonitoringSource(monitoring: PlatformMonitoringAdapter): Promise<{
    success: boolean;
    length?: number;
    error?: string;
}> {
    try {
        const result = await fetchHtml(monitoring.debugProbeUrl);

        if (result.kind !== 'success') {
            return {
                success: false,
                error: `${monitoring.displayName}: ${result.reason}`,
            };
        }

        return {
            success: true,
            length: result.html.length,
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
