import { describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';
import type { PlatformMonitoringAdapter } from '../../../../src/platforms/contracts';
import {
    debugFetchMonitoringSource,
    debugFetchMonitoringSources,
    fetchPlatformFeedJobsResult,
    hydratePlatformJob,
    MONITORING_FETCH_TIMEOUT_MS,
} from '../../../../src/features/monitoring/fetch-platform-html';
import { DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';

function createAdapter(
    overrides: Partial<PlatformMonitoringAdapter> = {}
): PlatformMonitoringAdapter {
    return {
        id: 'mostaql',
        displayName: 'مستقل',
        debugProbeUrl: 'https://mostaql.com/projects',
        resolveFeeds: () => ['https://mostaql.com/projects?sort=latest'],
        parseListingHtml: vi.fn(
            async (): Promise<readonly JobRecord[]> => [
                {
                    id: '1',
                    platformId: 'mostaql' as const,
                    title: 'مشروع',
                    url: 'https://mostaql.com/project/1',
                },
            ]
        ),
        parseProjectHtml: vi.fn(async () => ({
            description: 'تفاصيل',
        })),
        ...overrides,
    };
}

describe('platform HTML fetching', () => {
    it('fetches feeds with cache-busting and no credential leakage', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(123);
        const fetchMock = vi.fn(async () => new Response('<main>ok</main>'));
        vi.stubGlobal('fetch', fetchMock);
        const adapter = createAdapter();

        await expect(
            fetchPlatformFeedJobsResult(adapter, 'https://mostaql.com/projects')
        ).resolves.toMatchObject({
            kind: 'success',
            jobs: [{ id: '1' }],
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://mostaql.com/projects?_cb=123',
            expect.objectContaining({
                method: 'GET',
                credentials: 'omit',
                cache: 'no-store',
                referrerPolicy: 'no-referrer',
            })
        );
    });

    it('appends cache-busting to existing query strings and sanitizes non-TypeError failures', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(456);
        const longMessage = `provider ${'x'.repeat(300)}`;
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('<main>ok</main>'))
            .mockRejectedValueOnce(new Error(longMessage))
            .mockRejectedValueOnce('plain string failure');
        vi.stubGlobal('fetch', fetchMock);
        const adapter = createAdapter();

        await expect(
            fetchPlatformFeedJobsResult(adapter, 'https://mostaql.com/projects?sort=latest')
        ).resolves.toMatchObject({ kind: 'success' });
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            'https://mostaql.com/projects?sort=latest&_cb=456'
        );

        await expect(
            fetchPlatformFeedJobsResult(adapter, 'https://mostaql.com/projects')
        ).resolves.toEqual({
            kind: 'error',
            reason: longMessage.slice(0, 240),
        });

        await expect(
            fetchPlatformFeedJobsResult(adapter, 'https://mostaql.com/projects')
        ).resolves.toEqual({
            kind: 'error',
            reason: 'plain string failure',
        });
    });

    it('rejects empty, HTTP error, challenge, and network-failure responses without parsing', async () => {
        const adapter = createAdapter();

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('', { status: 200 }))
        );
        await expect(
            fetchPlatformFeedJobsResult(adapter, 'https://mostaql.com/projects')
        ).resolves.toMatchObject({
            kind: 'error',
            reason: 'Received an empty HTML document.',
        });

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('nope', { status: 503 }))
        );
        await expect(
            fetchPlatformFeedJobsResult(adapter, 'https://mostaql.com/projects')
        ).resolves.toMatchObject({
            kind: 'error',
            reason: 'Request failed with HTTP 503.',
        });

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<title>Just a moment</title>'))
        );
        await expect(
            fetchPlatformFeedJobsResult(adapter, 'https://mostaql.com/projects')
        ).resolves.toMatchObject({
            kind: 'error',
            reason: expect.stringContaining('Upstream challenge page detected'),
        });

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new TypeError('network');
            })
        );
        await expect(
            fetchPlatformFeedJobsResult(adapter, 'https://mostaql.com/projects')
        ).resolves.toMatchObject({
            kind: 'error',
            reason: 'Network request failed.',
        });
        expect(adapter.parseListingHtml).not.toHaveBeenCalled();
    });

    it('hydrates project details only when detail-page fetch succeeds', async () => {
        const adapter = createAdapter();
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<article>details</article>'))
        );

        await expect(
            hydratePlatformJob(adapter, {
                id: '1',
                platformId: 'mostaql',
                title: 'مشروع',
                url: 'https://mostaql.com/project/1',
            })
        ).resolves.toMatchObject({
            id: '1',
            description: 'تفاصيل',
        });

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('missing', { status: 404 }))
        );
        const missingDetailsResult = await hydratePlatformJob(adapter, {
            id: '2',
            platformId: 'mostaql',
            title: 'مشروع',
            url: 'https://mostaql.com/project/2',
        });
        expect(missingDetailsResult).toMatchObject({ id: '2' });
        expect(missingDetailsResult).not.toHaveProperty('description');
    });

    it('does not let undefined detail fields overwrite listing data during hydration', async () => {
        const adapter = createAdapter({
            parseProjectHtml: vi.fn(async () => ({
                description: undefined,
                budget: '$500',
            })),
        });
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<article>details</article>'))
        );

        await expect(
            hydratePlatformJob(adapter, {
                id: '3',
                platformId: 'mostaql',
                title: 'مشروع',
                description: 'وصف من القائمة',
                url: 'https://mostaql.com/project/3',
            })
        ).resolves.toMatchObject({
            id: '3',
            description: 'وصف من القائمة',
            budget: '$500',
        });
    });

    it('normalizes platform fetch timeouts for feeds and debug probes', async () => {
        vi.useFakeTimers();
        vi.spyOn(AbortSignal, 'timeout').mockImplementation((timeoutMs: number) => {
            const controller = new AbortController();
            setTimeout(() => {
                controller.abort(new DOMException('timeout', 'TimeoutError'));
            }, timeoutMs);

            return controller.signal;
        });
        vi.stubGlobal(
            'fetch',
            vi.fn(
                (_url: string, init?: RequestInit) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () => {
                            reject(init.signal?.reason);
                        });
                    })
            )
        );

        const feedResult = fetchPlatformFeedJobsResult(
            createAdapter(),
            'https://mostaql.com/projects'
        );
        await vi.advanceTimersByTimeAsync(MONITORING_FETCH_TIMEOUT_MS);
        await expect(feedResult).resolves.toEqual({
            kind: 'error',
            reason: `Request timed out after ${MONITORING_FETCH_TIMEOUT_MS}ms.`,
        });

        const debugResult = debugFetchMonitoringSource(createAdapter());
        await vi.advanceTimersByTimeAsync(MONITORING_FETCH_TIMEOUT_MS);
        await expect(debugResult).resolves.toEqual({
            success: false,
            error: `مستقل: Request timed out after ${MONITORING_FETCH_TIMEOUT_MS}ms.`,
        });
    });

    it('aggregates debug fetch source results', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('<main>ok</main>'))
        );
        await expect(debugFetchMonitoringSource(createAdapter())).resolves.toEqual({
            success: true,
            length: 15,
        });

        await expect(debugFetchMonitoringSources([])).resolves.toEqual({
            success: false,
            error: 'No monitoring platforms are enabled.',
        });

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('blocked', { status: 403 }))
        );
        await expect(debugFetchMonitoringSources([createAdapter()])).resolves.toMatchObject({
            success: false,
            error: expect.stringContaining('مستقل: Request failed with HTTP 403.'),
        });
    });

    it('catches debug body-read failures and sums only successful mixed probes', async () => {
        const brokenResponse: Pick<Response, 'ok' | 'status' | 'text'> = {
            ok: true,
            status: 200,
            text: vi.fn(async () => {
                throw new Error('body stream failed');
            }),
        };
        vi.stubGlobal(
            'fetch',
            vi.fn(async (): Promise<Response> => brokenResponse as Response)
        );

        await expect(debugFetchMonitoringSource(createAdapter())).resolves.toEqual({
            success: false,
            error: 'مستقل: body stream failed',
        });

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('<main>first</main>'))
            .mockResolvedValueOnce(new Response('blocked', { status: 403 }))
            .mockResolvedValueOnce(new Response('<main>second</main>'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            debugFetchMonitoringSources([
                createAdapter({ id: 'mostaql', displayName: 'مستقل' }),
                createAdapter({ id: 'khamsat', displayName: 'خمسات' }),
                createAdapter({ id: 'nafezly', displayName: 'نفذلي' }),
            ])
        ).resolves.toEqual({
            success: true,
            length: '<main>first</main>'.length + '<main>second</main>'.length,
        });
    });

    it('keeps adapter feed resolution independent from default settings object shape', () => {
        expect(createAdapter().resolveFeeds(DEFAULT_SETTINGS)).toEqual([
            'https://mostaql.com/projects?sort=latest',
        ]);
    });
});
