import { describe, expect, it, vi } from 'vitest';

import {
    computeMostaqlBidStatusStats,
    computeMostaqlBidTrackerStats,
    fetchMostaqlBidRows,
    loadMostaqlBidTrackerData,
    parseMostaqlBidDatetime,
    parseMostaqlBidRow,
    type MostaqlBidListItem,
} from '../../../../src/platforms/mostaql/bid-tracker';

const rows: MostaqlBidListItem[] = [
    {
        title: 'Recent bid',
        url: 'https://mostaql.com/projects/1-test',
        status: 'pending',
        publishedDatetime: '2026-05-22 11:00:00',
        price: '$100',
    },
    {
        title: 'Old bid',
        url: 'https://mostaql.com/projects/2-test',
        status: 'closed',
        publishedDatetime: '2026-04-01 12:00:00',
        price: '$200',
    },
];

function createBidRowHtml(options: {
    readonly title: string;
    readonly href: string;
    readonly status?: string;
    readonly datetime?: string;
    readonly price?: string;
}): string {
    return `
        <tr class="bid-row">
            <td>
                <h2><a href="${options.href}">${options.title}</a></h2>
                <span class="label-prj-pending">${options.status ?? 'بانتظار الموافقة'}</span>
                <time datetime="${options.datetime ?? '2026-05-22 10:00:00'}"></time>
                <ul class="project__meta">
                    <li><i class="fa-money"></i><span>${options.price ?? '$150'}</span></li>
                </ul>
            </td>
        </tr>
    `;
}

function createJsonResponse(payload: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(payload), {
        status: init.status ?? 200,
        headers: {
            'content-type': 'application/json',
            ...init.headers,
        },
    });
}

describe('Mostaql bid tracker analytics', () => {
    it('parses bid dashboard rows and rejects off-platform project URLs', () => {
        expect(
            parseMostaqlBidRow(
                createBidRowHtml({
                    title: 'مشروع آمن',
                    href: '/projects/123-secure-project',
                    status: 'مكتمل',
                })
            )
        ).toMatchObject({
            title: 'مشروع آمن',
            url: 'https://mostaql.com/projects/123-secure-project',
            status: 'مكتمل',
            price: '$150',
        });

        expect(
            parseMostaqlBidRow(
                createBidRowHtml({
                    title: 'رابط خارجي',
                    href: 'https://evil.example/projects/123',
                })
            )?.url
        ).toBe('');
        expect(parseMostaqlBidRow('<tr><td>not a bid row</td></tr>')).toBeNull();
    });

    it.each([
        ['date object', new Date('2026-05-22T12:00:00Z'), '2026-05-22T12:00:00.000Z'],
        ['SQL-style datetime', '2026-05-22 11:30:15', '2026-05-22T11:30:15.000Z'],
        ['date-only value', '2026-05-22', '2026-05-22T00:00:00.000Z'],
        ['ISO fallback value', '2026-05-22T14:00:00.000Z', '2026-05-22T14:00:00.000Z'],
    ])('parses %s bid datetimes deterministically', (_label, value, expected) => {
        expect(parseMostaqlBidDatetime(value)?.toISOString()).toBe(expected);
    });

    it.each([null, undefined, '', '   ', 'not-a-date', Number.NaN, new Date('bad')])(
        'rejects malformed bid datetime %s',
        (value) => {
            expect(parseMostaqlBidDatetime(value)).toBeNull();
        }
    );

    it('counts the active 30-day and 24-hour bid windows', () => {
        const stats = computeMostaqlBidTrackerStats(rows, {
            now: new Date('2026-05-22T12:00:00Z'),
        });

        expect(stats.total30d).toBe(1);
        expect(stats.todayCount).toBe(1);
        expect(stats.nextAvailable?.title).toBe('Recent bid');
        expect(stats.byStatus.pending).toBe(1);
    });

    it('normalizes Arabic status buckets and skips invalid/future dates in time windows', () => {
        const stats = computeMostaqlBidStatusStats(
            [
                ...rows,
                {
                    title: 'Completed',
                    url: 'https://mostaql.com/projects/3-test',
                    status: 'تم التنفيذ - مكتمل',
                    publishedDatetime: '2026-05-20 12:00:00',
                    price: '$300',
                },
                {
                    title: 'Rejected',
                    url: 'https://mostaql.com/projects/4-test',
                    status: 'عرض مستبعد',
                    publishedDatetime: 'not-a-date',
                    price: '$400',
                },
                {
                    title: 'Future',
                    url: 'https://mostaql.com/projects/5-test',
                    status: null,
                    publishedDatetime: '2026-05-23 12:00:00',
                    price: '$500',
                },
            ],
            {
                now: new Date('2026-05-22T12:00:00Z'),
            }
        );

        expect(stats.status.total).toBe(5);
        expect(stats.status.byStatus).toMatchObject({
            pending: 1,
            closed: 1,
            مكتمل: 1,
            مستبعد: 1,
            'بانتظار الموافقة': 1,
        });
        expect(stats.last30Days.total).toBe(2);
        expect(stats.last30Days.invalidDateCount).toBe(1);
        expect(stats.last1Day.total).toBe(1);
        expect(stats.recent24hBids[0]?.title).toBe('Recent bid');
    });

    it('exposes shared content analytics buckets', () => {
        const stats = computeMostaqlBidStatusStats(rows, {
            now: new Date('2026-05-22T12:00:00Z'),
        });

        expect(stats.status.total).toBe(2);
        expect(stats.last30Days.total).toBe(1);
        expect(stats.last1Day.total).toBe(1);
        expect(stats.recent24hBids[0]?.title).toBe('Recent bid');
    });

    it('loads bid rows page by page, caps requested pages, and keeps valid earlier rows', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url.includes('page=1')) {
                return createJsonResponse({
                    count: 75,
                    collection: [
                        {
                            id: 10,
                            rendered: createBidRowHtml({
                                title: 'First page bid',
                                href: '/projects/10-first',
                            }),
                        },
                        '<tr><td>ignored</td></tr>',
                    ],
                });
            }

            return createJsonResponse({ message: 'blocked' }, { status: 503 });
        }) as unknown as typeof fetch;

        await expect(
            fetchMostaqlBidRows({
                fetchImpl,
                maxPages: 2,
                timeoutMs: 25,
            })
        ).resolves.toMatchObject([
            {
                apiBidId: 10,
                title: 'First page bid',
                url: 'https://mostaql.com/projects/10-first',
            },
        ]);

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledWith('Mostaql bid analytics limited to 2 pages out of 3.');
        expect(warn).toHaveBeenCalledWith(
            'Bid tracker: Page 2 failed:',
            'Bid page 2 request failed: 503'
        );
    });

    it('loads homepage availability with bid tracker data without live requests', async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url === 'https://mostaql.com/') {
                return new Response(
                    '<a href="/dashboard/bids"><span class="text-alpha">12</span></a>',
                    { headers: { 'content-type': 'text/html' } }
                );
            }

            return createJsonResponse({
                count: 0,
                collection: [],
            });
        }) as unknown as typeof fetch;

        await expect(loadMostaqlBidTrackerData(fetchImpl)).resolves.toMatchObject({
            homepageStats: { available: 12 },
            stats: {
                total30d: 0,
                todayCount: 0,
                nextAvailable: null,
            },
        });
    });
});
