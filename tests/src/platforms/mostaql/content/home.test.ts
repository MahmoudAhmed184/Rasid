import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlatformContentServices } from '../../../../../src/platforms/contracts';
import type { TrackedProjectRecord } from '../../../../../src/platforms/contracts';
import { installTestDom } from '../../../../support/html';

const bidTracker = vi.hoisted(() => ({
    loadMostaqlBidStatusStats: vi.fn(async () => ({
        status: {
            total: 6,
            byStatus: {
                مكتمل: 2,
                مستبعد: 3,
                مُغلق: 1,
            },
        },
        last30Days: {
            total: 3,
            byStatus: {
                'بانتظار الموافقة': 1,
                مستبعد: 2,
            },
        },
        last1Day: {
            total: 1,
            byStatus: {
                'بانتظار الموافقة': 1,
            },
        },
        recent24hBids: [
            {
                id: 'bid-1',
                title: 'عرض حديث',
                url: 'https://mostaql.com/project/1-recent',
                status: 'بانتظار الموافقة',
                published: new Date('2026-05-22T10:00:00.000Z'),
                ageMs: 2 * 60 * 60 * 1000,
            },
        ],
    })),
}));

vi.mock('../../../../../src/platforms/mostaql/bid-tracker', () => bidTracker);

async function importHomeModule() {
    return import('../../../../../src/platforms/mostaql/content/home');
}

function installHomeDom(): Document {
    const document = installTestDom(`
        <main>
            <section id="project-states"></section>
            <a id="processing-link" href="https://mostaql.com/dashboard/bids?status=processing">processing</a>
            <div class="progress__bar"><span class="label-prj-completed">completed</span></div>
        </main>
    `);
    const location = new URL('https://mostaql.com/');

    Object.defineProperty(window, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
        configurable: true,
        get(this: HTMLElement) {
            return this.textContent ?? '';
        },
        set(this: HTMLElement, value: string) {
            this.textContent = value;
        },
    });

    return document;
}

function createTracking() {
    const records: TrackedProjectRecord[] = [
        {
            id: 'old',
            platformId: 'mostaql',
            title: 'مشروع قديم',
            url: 'https://mostaql.com/project/10-old',
            status: 'مغلق',
            communications: '5',
            budget: '$100',
            publishDate: 'منذ يومين',
            clientName: 'عميل قديم',
            lastChecked: '2026-05-21T10:00:00.000Z',
        },
        {
            id: 'new',
            platformId: 'mostaql',
            title: 'مشروع جديد',
            url: 'https://mostaql.com/project/11-new',
            status: 'جارٍ التنفيذ',
            communications: '2',
            budget: '$500',
            publishDate: 'منذ ساعة',
            clientName: 'عميل جديد',
            lastChecked: '2026-05-22T10:00:00.000Z',
        },
        {
            id: 'unsafe',
            platformId: 'mostaql',
            title: 'مشروع غير آمن',
            url: 'https://evil.example/project/1',
            lastChecked: '2026-05-20T10:00:00.000Z',
        },
    ];
    const list = vi.fn(async () => records);
    const isTracked = vi.fn(async () => false);
    const toggle = vi.fn(async () => 'tracked' as const);
    const tracking: PlatformContentServices['tracking'] = {
        list,
        isTracked,
        toggle,
    };

    return {
        tracking,
        list,
        isTracked,
        toggle,
    };
}

describe('Mostaql home injectors', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules();
        bidTracker.loadMostaqlBidStatusStats.mockClear();
    });

    it('defers when the dashboard target is missing and avoids duplicate injection', async () => {
        const document = installTestDom('<main></main>');
        const location = new URL('https://mostaql.com/');
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: location,
        });
        Object.defineProperty(globalThis, 'location', {
            configurable: true,
            value: location,
        });
        const tracking = createTracking();
        const { injectDashboardStats } = await importHomeModule();

        expect(injectDashboardStats(tracking.tracking)).toBeUndefined();

        installHomeDom();
        const dispose = injectDashboardStats(tracking.tracking);
        expect(injectDashboardStats(tracking.tracking)).toBeUndefined();
        expect(document.getElementById('mostaql-msg-tools')).toBeNull();
        expect(globalThis.document.getElementById('mostaql-msg-tools')).toBeInstanceOf(HTMLElement);

        dispose?.();
    });

    it('injects dashboard controls, cleans native links, renders analytics, and disposes state', async () => {
        const document = installHomeDom();
        const tracking = createTracking();
        const { injectDashboardStats } = await importHomeModule();

        const dispose = injectDashboardStats(tracking.tracking);

        expect(dispose).toBeTypeOf('function');
        expect(document.getElementById('mostaql-msg-tools')).toBeInstanceOf(HTMLElement);
        expect(document.getElementById('rasid-analytics-modal')).toBeInstanceOf(HTMLElement);
        expect(document.getElementById('rasid-monitored-modal')).toBeInstanceOf(HTMLElement);
        expect(document.getElementById('processing-link')?.getAttribute('href')).toBeNull();
        expect(document.querySelector('.label-prj-completed')).toBeNull();

        document.getElementById('rasid-show-analytics-btn')?.click();
        await vi.waitFor(() => {
            expect(bidTracker.loadMostaqlBidStatusStats).toHaveBeenCalledOnce();
            expect(document.getElementById('rasid-analytics-modal-body')?.textContent).toContain(
                'إجمالي العروض'
            );
            expect(document.querySelector('.rasid-countdown')?.textContent).not.toBe('--:--:--');
        });

        dispose?.();
        expect(document.getElementById('mostaql-msg-tools')).toBeNull();
        expect(document.getElementById('rasid-analytics-modal')).toBeNull();
        expect(document.getElementById('rasid-monitored-modal')).toBeNull();
        expect(window._rasidStatsLoaded).toBe(false);
        expect(window.rasidCountdownsInterval).toBeUndefined();
    });

    it('renders empty analytics states without countdowns', async () => {
        const document = installHomeDom();
        const tracking = createTracking();
        bidTracker.loadMostaqlBidStatusStats.mockResolvedValueOnce({
            status: {
                total: 0,
                byStatus: {} as { مكتمل: number; مستبعد: number; مُغلق: number },
            },
            last30Days: {
                total: 0,
                byStatus: {} as { 'بانتظار الموافقة': number; مستبعد: number },
            },
            last1Day: {
                total: 0,
                byStatus: {} as { 'بانتظار الموافقة': number },
            },
            recent24hBids: [],
        });
        const { injectDashboardStats } = await importHomeModule();
        const dispose = injectDashboardStats(tracking.tracking);

        document.getElementById('rasid-show-analytics-btn')?.click();

        await vi.waitFor(() => {
            expect(document.getElementById('rasid-analytics-modal-body')?.textContent).toContain(
                'لا توجد عروض اليوم'
            );
        });
        expect(document.querySelector('.rasid-countdown')).toBeNull();
        expect(window.rasidCountdownsInterval).toBeDefined();

        dispose?.();
    });

    it('logs analytics loading failures without replacing the loading state', async () => {
        const document = installHomeDom();
        const tracking = createTracking();
        const error = new Error('stats unavailable');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        bidTracker.loadMostaqlBidStatusStats.mockRejectedValueOnce(error);
        const { injectDashboardStats } = await importHomeModule();
        injectDashboardStats(tracking.tracking);
        window._rasidStatsLoaded = false;

        document.getElementById('rasid-show-analytics-btn')?.click();

        await vi.waitFor(() => {
            expect(errorSpy).toHaveBeenCalledWith('Error fetching bids:', error);
        });
        expect(document.getElementById('rasid-analytics-modal-body')?.textContent).toContain(
            'جاري تحميل التحليلات'
        );
    });

    it('renders monitored projects sorted by last check and keeps off-origin links inert', async () => {
        const document = installHomeDom();
        const tracking = createTracking();
        const { injectDashboardStats } = await importHomeModule();
        injectDashboardStats(tracking.tracking);

        document.getElementById('rasid-show-monitored-btn')?.click();

        await vi.waitFor(() => {
            expect(tracking.list).toHaveBeenCalledOnce();
            expect(document.getElementById('rasid-monitored-modal')?.style.display).toBe('block');
            expect(document.getElementById('rasid-monitored-modal-body')?.textContent).toContain(
                'مشروع جديد'
            );
        });

        const projectLinks = [...document.querySelectorAll<HTMLAnchorElement>('.project__title a')];
        expect(projectLinks.map((link) => link.textContent)).toEqual([
            'مشروع جديد',
            'مشروع قديم',
            'مشروع غير آمن',
        ]);
        expect(projectLinks[0]?.href).toBe('https://mostaql.com/project/11-new');
        expect(projectLinks[2]?.getAttribute('href')).toBeNull();

        document.getElementById('rasid-monitored-refresh')?.click();
        await vi.waitFor(() => {
            expect(tracking.list).toHaveBeenCalledTimes(2);
        });

        document.getElementById('rasid-monitored-close')?.click();
        expect(document.getElementById('rasid-monitored-modal')?.style.display).toBe('none');

        document.getElementById('rasid-show-monitored-btn')?.click();
        document
            .getElementById('rasid-monitored-modal')
            ?.dispatchEvent(new window.Event('click', { bubbles: true }));
        expect(document.getElementById('rasid-monitored-modal')?.style.display).toBe('none');
    });

    it('injects the monitored modal by itself and reports empty tracking lists', async () => {
        installHomeDom();
        const tracking = createTracking();
        tracking.list.mockResolvedValueOnce([]);
        const { injectMonitoredProjects } = await importHomeModule();

        const dispose = injectMonitoredProjects(tracking.tracking);
        expect(dispose).toBeTypeOf('function');

        document.getElementById('rasid-monitored-refresh')?.click();

        await vi.waitFor(() => {
            expect(document.getElementById('rasid-monitored-modal-body')?.textContent).toContain(
                'لا توجد مشاريع مراقبة'
            );
        });

        expect(injectMonitoredProjects(tracking.tracking)).toBeUndefined();
        dispose?.();
        expect(document.getElementById('rasid-monitored-modal')).toBeNull();
    });
});
