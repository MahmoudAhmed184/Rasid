import { resolvePlatformUrl } from '../../entities/platform/url';
import { queryHtmlFragment } from '../../shared/dom/html-fragments';

interface BidPageResponse {
    collection?: Array<{ id?: string | number; rendered?: string } | string>;
    count?: number;
}

export interface MostaqlBidListItem {
    apiBidId?: string | number | null;
    title: string | null;
    url: string;
    status: string | null;
    publishedDatetime: string | null;
    price: string | null;
}

export interface MostaqlTimelineBid {
    title: string | null;
    url: string;
    status: string | null;
    price: string | null;
    published: Date;
    ageMs: number;
    msLeft: number;
}

export interface MostaqlBidTrackerStats {
    total30d: number;
    todayCount: number;
    nextAvailable: MostaqlTimelineBid | null;
    byStatus: Record<string, number>;
    bids: MostaqlTimelineBid[];
}

export interface MostaqlHomepageBidStats {
    available: string | number;
}

export interface MostaqlBidTrackerData {
    homepageStats: MostaqlHomepageBidStats;
    stats: MostaqlBidTrackerStats;
}

export interface MostaqlBidStatusBucket {
    total: number;
    byStatus: Record<string, number>;
    invalidDateCount: number;
}

export interface MostaqlBidStatusStats {
    meta: {
        now: string;
        totalItems: number;
        uniqueStatuses: string[];
    };
    status: MostaqlBidStatusBucket;
    last30Days: MostaqlBidStatusBucket;
    last1Day: MostaqlBidStatusBucket;
    recent24hBids: Array<{
        title: string | null;
        url: string | null;
        ageMs: number;
        published: Date;
    }>;
}

interface BidTrackerLoadOptions {
    readonly fetchImpl?: typeof fetch;
    readonly maxPages?: number;
    readonly timeoutMs?: number;
}

export const MOSTAQL_BID_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const MOSTAQL_BID_DASHBOARD_MAX_PAGES = 20;
export const MOSTAQL_BID_PAGE_TIMEOUT_MS = 10_000;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ITEMS_PER_PAGE = 25;
const MOSTAQL_HOSTS = ['mostaql.com'] as const;
const MOSTAQL_BASE_URL = 'https://mostaql.com/';
const MOSTAQL_PROJECT_PATH_PATTERN = /^\/projects?\/\d+(?:[-/]|$)/;

async function fetchBidTrackerPage(
    fetchImpl: typeof fetch,
    pageNumber: number,
    timeoutMs: number
): Promise<BidPageResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;

    try {
        response = await fetchImpl(
            `https://mostaql.com/dashboard/bids?page=${pageNumber}&sort=latest`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'include',
                signal: controller.signal,
            }
        );
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(`Bid page ${pageNumber} request failed: ${response.status}`);
    }

    return response.json() as Promise<BidPageResponse>;
}

export function parseMostaqlBidRow(renderedHtml: string): MostaqlBidListItem | null {
    if (typeof renderedHtml !== 'string') {
        return null;
    }

    const row = queryHtmlFragment<HTMLElement>(renderedHtml, 'tr.bid-row', {
        context: 'table-body',
    });
    if (!row) {
        return null;
    }

    const titleLink = row.querySelector<HTMLAnchorElement>('h2 a');
    const statusEl = row.querySelector('.label-prj-pending, .label');
    const timeEl = row.querySelector('time[datetime]');
    const priceEl = row
        .querySelector('.project__meta li .fa-money')
        ?.closest('li')
        ?.querySelector('span');
    const rawUrl = titleLink?.getAttribute('href') || '';
    const url =
        resolvePlatformUrl(rawUrl, {
            baseUrl: MOSTAQL_BASE_URL,
            allowedHosts: MOSTAQL_HOSTS,
            pathPattern: MOSTAQL_PROJECT_PATH_PATTERN,
        }) ?? '';

    return {
        apiBidId: null,
        title: titleLink?.textContent?.trim() || null,
        url,
        status: statusEl?.textContent?.trim() || null,
        publishedDatetime: timeEl?.getAttribute('datetime') || null,
        price: priceEl?.textContent?.trim() || null,
    };
}

function processBidPage(pageData: BidPageResponse): MostaqlBidListItem[] {
    const bids: MostaqlBidListItem[] = [];

    if (!Array.isArray(pageData.collection)) {
        return bids;
    }

    pageData.collection.forEach((bidObject) => {
        const htmlString = typeof bidObject === 'string' ? bidObject : bidObject.rendered || '';
        const item = parseMostaqlBidRow(htmlString);

        if (item) {
            item.apiBidId = typeof bidObject === 'string' ? null : (bidObject.id ?? null);
            bids.push(item);
        }
    });

    return bids;
}

export async function fetchMostaqlBidRows(
    options: BidTrackerLoadOptions = {}
): Promise<MostaqlBidListItem[]> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const maxPages = options.maxPages ?? MOSTAQL_BID_DASHBOARD_MAX_PAGES;
    const timeoutMs = options.timeoutMs ?? MOSTAQL_BID_PAGE_TIMEOUT_MS;
    const allBids: MostaqlBidListItem[] = [];
    const firstPage = await fetchBidTrackerPage(fetchImpl, 1, timeoutMs);
    allBids.push(...processBidPage(firstPage));

    const reportedTotalPages = Math.max(
        1,
        Math.ceil(Number(firstPage.count ?? 0) / ITEMS_PER_PAGE)
    );
    const totalPages = Math.min(reportedTotalPages, maxPages);

    if (reportedTotalPages > maxPages) {
        console.warn(
            `Mostaql bid analytics limited to ${maxPages} pages out of ${reportedTotalPages}.`
        );
    }

    for (let page = 2; page <= totalPages; page += 1) {
        try {
            const pageData = await fetchBidTrackerPage(fetchImpl, page, timeoutMs);
            allBids.push(...processBidPage(pageData));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`Bid tracker: Page ${page} failed:`, message);
        }
    }

    return allBids;
}

export function parseMostaqlBidDatetime(value: unknown): Date | null {
    if (!value) {
        return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const source = value.trim();

    if (!source) {
        return null;
    }

    const match = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);

    if (match) {
        const parsed = new Date(
            Date.UTC(
                Number(match[1]),
                Number(match[2]) - 1,
                Number(match[3]),
                Number(match[4] ?? 0),
                Number(match[5] ?? 0),
                Number(match[6] ?? 0)
            )
        );

        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const fallback = new Date(source);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function normalizeStatusLabel(rawStatus: string | null): string {
    if (!rawStatus) {
        return 'بانتظار الموافقة';
    }

    const status = rawStatus.trim();

    if (status.includes('مكتمل')) {
        return 'مكتمل';
    }

    if (status.includes('مستبعد')) {
        return 'مستبعد';
    }

    if (status.includes('مُغلق') || status.includes('مغلق')) {
        return 'مُغلق';
    }

    if (status.includes('انتظار')) {
        return 'بانتظار الموافقة';
    }

    return status;
}

export function computeMostaqlBidTrackerStats(
    allBids: readonly MostaqlBidListItem[],
    options: { readonly now?: number | Date } = {}
): MostaqlBidTrackerStats {
    const now =
        options.now instanceof Date
            ? options.now.getTime()
            : typeof options.now === 'number'
              ? options.now
              : Date.now();
    const bidsInRange: MostaqlTimelineBid[] = [];
    const bidsToday: MostaqlBidListItem[] = [];
    const byStatus: Record<string, number> = {};

    for (const bid of allBids) {
        const published = parseMostaqlBidDatetime(bid.publishedDatetime);

        if (!published) {
            continue;
        }

        const ageMs = now - published.getTime();

        if (ageMs < 0) {
            continue;
        }

        if (ageMs <= MOSTAQL_BID_WINDOW_MS) {
            const msLeft = MOSTAQL_BID_WINDOW_MS - ageMs;
            const normalizedStatus = normalizeStatusLabel(bid.status);
            byStatus[normalizedStatus] = (byStatus[normalizedStatus] || 0) + 1;

            bidsInRange.push({
                title: bid.title,
                url: bid.url,
                status: bid.status,
                price: bid.price,
                published,
                ageMs,
                msLeft,
            });
        }

        if (ageMs <= ONE_DAY_MS) {
            bidsToday.push(bid);
        }
    }

    bidsInRange.sort((left, right) => right.ageMs - left.ageMs);

    return {
        total30d: bidsInRange.length,
        todayCount: bidsToday.length,
        nextAvailable: bidsInRange[0] ?? null,
        byStatus,
        bids: bidsInRange,
    };
}

export function computeMostaqlBidStatusStats(
    allBids: readonly MostaqlBidListItem[],
    options: { readonly now?: Date } = {}
): MostaqlBidStatusStats {
    const now = options.now instanceof Date ? options.now : new Date();
    const makeEmptyBucket = (): MostaqlBidStatusBucket => ({
        total: 0,
        byStatus: {},
        invalidDateCount: 0,
    });
    const overall = makeEmptyBucket();
    const last30Days = makeEmptyBucket();
    const last1Day = makeEmptyBucket();
    const recent24hBids: MostaqlBidStatusStats['recent24hBids'] = [];

    const addToBucket = (bucket: MostaqlBidStatusBucket, status: string): void => {
        bucket.total += 1;
        bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
    };

    for (const item of allBids) {
        const status = normalizeStatusLabel(item.status);
        addToBucket(overall, status);

        const published = parseMostaqlBidDatetime(item.publishedDatetime);
        if (!published) {
            last30Days.invalidDateCount += 1;
            last1Day.invalidDateCount += 1;
            continue;
        }

        const ageMs = now.getTime() - published.getTime();
        if (ageMs < 0) {
            continue;
        }

        if (ageMs <= MOSTAQL_BID_WINDOW_MS) {
            addToBucket(last30Days, status);
        }

        if (ageMs <= ONE_DAY_MS) {
            addToBucket(last1Day, status);
            recent24hBids.push({
                title: item.title,
                url: item.url,
                ageMs,
                published,
            });
        }
    }

    const uniqueStatuses = Array.from(new Set(Object.keys(overall.byStatus))).sort((a, b) =>
        a.localeCompare(b, 'ar')
    );

    return {
        meta: { now: now.toISOString(), totalItems: allBids.length, uniqueStatuses },
        status: overall,
        last30Days,
        last1Day,
        recent24hBids,
    };
}

export async function loadMostaqlBidStatusStats(
    options: BidTrackerLoadOptions = {}
): Promise<MostaqlBidStatusStats> {
    return computeMostaqlBidStatusStats(await fetchMostaqlBidRows(options));
}

async function fetchHomepageStats(fetchImpl: typeof fetch): Promise<MostaqlHomepageBidStats> {
    const defaults = { available: '-' };

    try {
        const response = await fetchImpl('https://mostaql.com/', {
            credentials: 'include',
            headers: { Accept: 'text/html' },
        });

        if (!response.ok) {
            return defaults;
        }

        const html = await response.text();
        const parser = new DOMParser();
        const documentRoot = parser.parseFromString(html, 'text/html');
        const availableLink = documentRoot.querySelector('a[href*="dashboard/bids"] .text-alpha');

        if (availableLink) {
            return {
                available: Number.parseInt(availableLink.textContent?.trim() || '0', 10) || 0,
            };
        }

        return defaults;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Homepage stats fetch failed:', message);
        return defaults;
    }
}

export async function loadMostaqlBidTrackerData(
    fetchImpl: typeof fetch = fetch
): Promise<MostaqlBidTrackerData> {
    const [homepageStats, allBids] = await Promise.all([
        fetchHomepageStats(fetchImpl),
        fetchMostaqlBidRows({ fetchImpl }),
    ]);

    return {
        homepageStats,
        stats: computeMostaqlBidTrackerStats(allBids),
    };
}
