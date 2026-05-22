import { describe, expect, it, vi } from 'vitest';

import type { MostaqlBidTrackerData } from '../../../../src/platforms/mostaql/bid-tracker';
import { createBidTracker } from '../../../../src/app/dashboard/bid-tracker';
import { installTestDom } from '../../../support/html';

const bidTrackerSource = vi.hoisted(() => ({
    loadMostaqlBidTrackerData: vi.fn(),
    MOSTAQL_BID_WINDOW_MS: 30 * 24 * 60 * 60 * 1000,
}));

vi.mock('../../../../src/platforms/mostaql/bid-tracker', () => bidTrackerSource);

function installBidTrackerDom(): Document {
    const document = installTestDom(`
        <button id="refreshBidsBtn" type="button"></button>
        <span id="bids-total-30d"></span>
        <span id="bids-available-slots"></span>
        <span id="bids-next-available"></span>
        <span id="bids-today-count"></span>
        <div id="bidsStatusGrid"></div>
        <div id="bidsTimelineList"></div>
    `);

    Object.defineProperty(window, 'setInterval', {
        configurable: true,
        value: setInterval,
    });
    Object.defineProperty(window, 'clearInterval', {
        configurable: true,
        value: clearInterval,
    });

    return document;
}

function createTrackerData(overrides: Partial<MostaqlBidTrackerData> = {}): MostaqlBidTrackerData {
    return {
        homepageStats: {
            available: 3,
        },
        stats: {
            total30d: 2,
            todayCount: 1,
            nextAvailable: {
                title: 'أقدم عرض',
                url: 'https://mostaql.com/project/1',
                status: 'بانتظار الموافقة',
                price: '$500',
                published: new Date('2026-04-23T12:00:00.000Z'),
                ageMs: 29 * 24 * 60 * 60 * 1000,
                msLeft: 24 * 60 * 60 * 1000,
            },
            byStatus: {
                'بانتظار الموافقة': 1,
                مكتمل: 1,
            },
            bids: [
                {
                    title: 'مشروع لوحة تحكم',
                    url: 'https://mostaql.com/project/100',
                    status: 'بانتظار الموافقة',
                    price: '$500',
                    published: new Date('2026-05-21T12:00:00.000Z'),
                    ageMs: 24 * 60 * 60 * 1000,
                    msLeft: 60_000,
                },
                {
                    title: 'مشروع مكتمل',
                    url: 'https://mostaql.com/project/101',
                    status: 'مكتمل',
                    price: null,
                    published: new Date('2026-05-20T12:00:00.000Z'),
                    ageMs: 2 * 24 * 60 * 60 * 1000,
                    msLeft: 0,
                },
            ],
        },
        ...overrides,
    };
}

describe('dashboard bid tracker', () => {
    it('renders summary, status cards, timeline rows, and updates countdowns', async () => {
        vi.useFakeTimers();
        const document = installBidTrackerDom();
        bidTrackerSource.loadMostaqlBidTrackerData.mockResolvedValue(createTrackerData());
        const tracker = createBidTracker(document);

        tracker.bind();
        await tracker.initOnce();

        expect(document.getElementById('bids-total-30d')?.textContent).toBe('2');
        expect(document.getElementById('bids-available-slots')?.textContent).toBe('3');
        expect(document.getElementById('bids-today-count')?.textContent).toBe('1');
        expect(document.getElementById('bids-next-available')?.textContent).toBe('1 يوم 0 ساعة');
        expect(document.querySelectorAll('.bid-status-card')).toHaveLength(2);
        expect(document.querySelector('.bid-status-label')?.textContent).toBe('بانتظار الموافقة');
        expect(document.querySelectorAll('.bid-timeline-item')).toHaveLength(2);
        expect(document.querySelector<HTMLAnchorElement>('.bid-timeline-title')?.href).toBe(
            'https://mostaql.com/project/100'
        );

        const countdown = document.querySelector<HTMLElement>('.bid-tracker-countdown');
        expect(countdown?.textContent).toBe('00:00:59');
        await vi.advanceTimersByTimeAsync(1000);
        expect(countdown?.textContent).toBe('00:00:58');

        document.getElementById('refreshBidsBtn')?.click();
        await vi.waitFor(() =>
            expect(bidTrackerSource.loadMostaqlBidTrackerData).toHaveBeenCalledTimes(2)
        );
        tracker.destroy();
    });

    it('shows empty, error, and retry states', async () => {
        const document = installBidTrackerDom();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        bidTrackerSource.loadMostaqlBidTrackerData.mockResolvedValueOnce(
            createTrackerData({
                stats: {
                    total30d: 0,
                    todayCount: 0,
                    nextAvailable: null,
                    byStatus: {},
                    bids: [],
                },
            })
        );
        const tracker = createBidTracker(document);

        await tracker.initOnce();
        expect(document.querySelector('.bids-empty')?.textContent).toContain(
            'لا توجد عروض في آخر 30 يوم'
        );
        expect(document.getElementById('bidsStatusGrid')?.textContent).toContain(
            'لا توجد بيانات حالات'
        );

        bidTrackerSource.loadMostaqlBidTrackerData
            .mockRejectedValueOnce(new Error('blocked'))
            .mockResolvedValueOnce(createTrackerData());
        await tracker.refresh();

        expect(consoleError).toHaveBeenCalledWith('Bid tracker load failed:', expect.any(Error));
        expect(document.querySelector('.bids-error')?.textContent).toContain('blocked');

        tracker.bind();
        document.querySelector<HTMLButtonElement>('.btn-retry-bids')?.click();
        await vi.waitFor(() =>
            expect(document.querySelectorAll('.bid-timeline-item')).toHaveLength(2)
        );
    });

    it('handles missing containers and keeps initOnce idempotent until refresh', async () => {
        const document = installTestDom('<main></main>');
        bidTrackerSource.loadMostaqlBidTrackerData.mockResolvedValue(createTrackerData());
        const tracker = createBidTracker(document);

        tracker.bind();
        tracker.bind();
        await tracker.initOnce();
        await tracker.initOnce();

        expect(bidTrackerSource.loadMostaqlBidTrackerData).toHaveBeenCalledOnce();

        await tracker.refresh();
        expect(bidTrackerSource.loadMostaqlBidTrackerData).toHaveBeenCalledTimes(2);
        tracker.destroy();
    });

    it('renders fallback labels, day countdowns, and invalid timer data safely', async () => {
        vi.useFakeTimers();
        const document = installBidTrackerDom();
        bidTrackerSource.loadMostaqlBidTrackerData.mockResolvedValue(
            createTrackerData({
                homepageStats: {
                    available: 0,
                },
                stats: {
                    total30d: 1,
                    todayCount: 0,
                    nextAvailable: {
                        title: 'قريب',
                        url: 'https://mostaql.com/project/next',
                        status: null,
                        price: null,
                        published: new Date('2026-05-20T12:00:00.000Z'),
                        ageMs: 0,
                        msLeft: 4 * 60 * 60 * 1000,
                    },
                    byStatus: {
                        'قيد المراجعة': 1,
                    },
                    bids: [
                        {
                            title: '',
                            url: '',
                            status: null,
                            price: '$50',
                            published: new Date('2026-05-18T12:00:00.000Z'),
                            ageMs: 2 * 24 * 60 * 60 * 1000,
                            msLeft: 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000,
                        },
                    ],
                },
            })
        );
        const tracker = createBidTracker(document);

        await tracker.initOnce();

        expect(document.getElementById('bids-next-available')?.textContent).toBe('4 ساعة');
        expect(document.querySelector('.bid-status-label')?.textContent).toBe('قيد المراجعة');
        expect(document.querySelector<HTMLAnchorElement>('.bid-timeline-title')?.href).toBe('#');
        expect(document.querySelector('.bid-timeline-title')?.textContent).toBe('عرض بدون عنوان');
        expect(document.querySelector('.bid-timeline-status')?.textContent).toBe('بانتظار');
        expect(document.querySelector('.bid-tracker-countdown')?.textContent).toBe('2d 02h 59m');

        const countdown = document.querySelector<HTMLElement>('.bid-tracker-countdown');
        const bar = document.querySelector<HTMLElement>('.bid-tracker-bar');
        countdown!.dataset.msLeft = 'not-a-number';
        bar!.dataset.msLeft = '0';

        await vi.advanceTimersByTimeAsync(1000);

        expect(countdown?.textContent).toBe('متاح الآن!');
        expect(countdown?.style.color).toBe('var(--success)');
        expect(bar?.style.width).toBe('100%');
        expect(bar?.style.background).toBe('var(--success)');
        tracker.destroy();
    });

    it('uses a generic dashboard error message for non-Error failures', async () => {
        const document = installBidTrackerDom();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        bidTrackerSource.loadMostaqlBidTrackerData.mockRejectedValueOnce('blocked-string');
        const tracker = createBidTracker(document);

        await tracker.initOnce();

        expect(document.querySelector('.bids-error')?.textContent).toContain('حدث خطأ غير متوقع');
    });
});
