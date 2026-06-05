import type { JobRecord } from '../../entities/job/model';
import type { PlatformMonitoringAdapter } from '../../platforms/contracts';
import { detectChallengePage } from '../../shared/network/challenge-page';

export const MONITORING_FETCH_TIMEOUT_MS = 15_000;

type HtmlFetchResult =
    | {
          readonly kind: 'success';
          readonly html: string;
      }
    | {
          readonly kind: 'error';
          readonly reason: string;
      };

export type PlatformFeedJobsResult =
    | {
          readonly kind: 'success';
          readonly jobs: readonly JobRecord[];
      }
    | {
          readonly kind: 'error';
          readonly reason: string;
      };

function isAbortLikeError(error: unknown): boolean {
    return (
        error instanceof DOMException &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
    );
}

function sanitizeFetchError(error: unknown): string {
    if (isAbortLikeError(error)) {
        return `Request timed out after ${MONITORING_FETCH_TIMEOUT_MS}ms.`;
    }

    if (error instanceof TypeError) {
        return 'Network request failed.';
    }

    return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
}

function createFetchTimeoutSignal(): {
    readonly signal: AbortSignal;
    cleanup(): void;
} {
    if (typeof AbortSignal.timeout === 'function') {
        return {
            signal: AbortSignal.timeout(MONITORING_FETCH_TIMEOUT_MS),
            cleanup() {
                // Native timeout signals clean themselves up.
            },
        };
    }

    const controller = new AbortController();
    const timerId = setTimeout(() => {
        controller.abort(
            new DOMException(
                `Request timed out after ${MONITORING_FETCH_TIMEOUT_MS}ms.`,
                'TimeoutError'
            )
        );
    }, MONITORING_FETCH_TIMEOUT_MS);

    return {
        signal: controller.signal,
        cleanup() {
            clearTimeout(timerId);
        },
    };
}

async function fetchHtml(url: string): Promise<HtmlFetchResult> {
    let response: Response;
    const timeout = createFetchTimeoutSignal();

    try {
        response = await fetch(url, {
            method: 'GET',
            signal: timeout.signal,
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
    } catch (error) {
        timeout.cleanup();
        return {
            kind: 'error',
            reason: sanitizeFetchError(error),
        };
    }

    if (!response.ok) {
        timeout.cleanup();
        return {
            kind: 'error',
            reason: `Request failed with HTTP ${response.status}.`,
        };
    }

    let html: string;
    try {
        html = await response.text();
    } catch (error) {
        return {
            kind: 'error',
            reason: sanitizeFetchError(error),
        };
    } finally {
        timeout.cleanup();
    }

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

function mergeDefinedJobDetails(
    job: Readonly<JobRecord>,
    details: Partial<JobRecord> | null | undefined
): JobRecord {
    if (!details) {
        return { ...job };
    }

    const definedDetails = Object.fromEntries(
        Object.entries(details).filter(([, value]) => value !== undefined)
    ) as Partial<JobRecord>;

    return {
        ...job,
        ...definedDetails,
    };
}

export async function fetchPlatformFeedJobsResult(
    monitoring: PlatformMonitoringAdapter,
    url: string
): Promise<PlatformFeedJobsResult> {
    const result = await fetchHtml(`${url}${url.includes('?') ? '&' : '?'}_cb=${Date.now()}`);

    if (result.kind !== 'success') {
        return {
            kind: 'error',
            reason: result.reason,
        };
    }

    return {
        kind: 'success',
        jobs: await monitoring.parseListingHtml(result.html),
    };
}

export async function hydratePlatformJob(
    monitoring: PlatformMonitoringAdapter,
    job: Readonly<JobRecord>
): Promise<JobRecord> {
    const result = await fetchHtml(job.url);

    if (result.kind !== 'success') {
        return { ...job };
    }

    return mergeDefinedJobDetails(job, await monitoring.parseProjectHtml(result.html));
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
