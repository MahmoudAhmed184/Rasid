import type { JobRecord } from '../../entities/job/model';
import { resolvePlatformUrl } from '../../entities/platform/url';
import { parseSafeDocument } from '../../shared/dom/safe-html';
import { parseJobPostedAt } from '../../shared/parsing/arabic-date';

const MOSTAQL_HOSTS = ['mostaql.com'] as const;
const MOSTAQL_BASE_URL = 'https://mostaql.com/';
const MOSTAQL_PROJECT_PATH_PATTERN = /^\/projects?\/\d+(?:[-/]|$)/;
const MOSTAQL_PROJECT_ID_PATTERN = /\/projects?\/(\d+)/;

function parseDocument(html: string): Document {
    return parseSafeDocument(html);
}

function resolveMostaqlProjectUrl(href: string | null): string | null {
    return resolvePlatformUrl(href, {
        baseUrl: MOSTAQL_BASE_URL,
        allowedHosts: MOSTAQL_HOSTS,
        pathPattern: MOSTAQL_PROJECT_PATH_PATTERN,
    });
}

function extractMostaqlProjectId(url: string): string | null {
    return new URL(url).pathname.match(MOSTAQL_PROJECT_ID_PATTERN)?.[1] ?? null;
}

function extractMostaqlProjectLink(item: Element): {
    link: HTMLAnchorElement;
    url: string;
    id: string;
} | null {
    const candidateLinks = item.querySelectorAll<HTMLAnchorElement>(
        'h2 a[href*="/project/"], h2 a[href*="/projects/"], h3 a[href*="/project/"], h3 a[href*="/projects/"], .card--title a[href*="/project/"], .card--title a[href*="/projects/"], .project-title a, a[class*="title"], a.details-url, a[href*="/project/"]:not([href*="/create"]):not([href*="template="]), a[href*="/projects/"]:not([href*="/create"]):not([href*="template="]), a[href*="/project/"], a[href*="/projects/"]'
    );

    let firstValidFallback: { link: HTMLAnchorElement; url: string; id: string } | null = null;

    for (const link of candidateLinks) {
        const href = link.getAttribute('href');
        if (!href || href.includes('/create') || href.includes('template=')) {
            continue;
        }

        const url = resolveMostaqlProjectUrl(href);
        const id = url ? extractMostaqlProjectId(url) : null;

        if (url && id) {
            const hasText = link.textContent.trim().length > 0;
            if (hasText) {
                return { link, url, id };
            }
            if (!firstValidFallback) {
                firstValidFallback = { link, url, id };
            }
        }
    }

    return firstValidFallback;
}

export function parseMostaqlListingHtml(html: string): JobRecord[] {
    const doc = parseDocument(html);
    const jobs: JobRecord[] = [];
    const seenIds = new Set<string>();

    doc.querySelectorAll(
        '.list-group-item, .project-row, tr.project-row, [data-project-id], tr[id^="project-"]'
    ).forEach((item) => {
        const extracted = extractMostaqlProjectLink(item);

        if (!extracted) {
            return;
        }

        const { link, url, id } = extracted;

        if (seenIds.has(id)) {
            return;
        }

        const userIcon = item.querySelector('.fa-user, .fa-user-circle');
        const posterEl =
            userIcon?.closest('li, span, div') ??
            item.querySelector('a[href*="/u/"], .project__author, bdi');
        const rawTimeEl = item.querySelector('time, .timeSince, [class*="date"], [class*="time"]');
        const timeEl = rawTimeEl?.querySelector('time') ?? rawTimeEl;
        const metaItems = item.querySelectorAll('.project__meta li, ul.list-meta-items li');
        const budgetEl = item.querySelector(
            '[data-type="project-budget_range"], .project__budget, .budget, td:nth-child(4)'
        );
        const descEl = item.querySelector('.project__brief, .project-brief, p.text-wrapper-div, p');

        let bidsText = '';
        for (const metaItem of metaItems) {
            const metaText = metaItem.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            if (
                metaText.includes('عرض') ||
                metaText.includes('عروض') ||
                metaItem.querySelector('.hsoub-file-signature-icon, .fa-comments, .fa-file-text-o')
            ) {
                bidsText = metaText;
                break;
            }
        }
        if (!bidsText && metaItems.length >= 3) {
            bidsText = metaItems[2]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        }

        const time = timeEl?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        let rawPostedAt =
            timeEl?.getAttribute('datetime') ??
            timeEl?.getAttribute('title') ??
            timeEl?.getAttribute('data-original-title') ??
            '';

        if (
            rawPostedAt &&
            /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?$/.test(rawPostedAt.trim())
        ) {
            rawPostedAt = `${rawPostedAt.trim().replace(/\s+/, 'T')}Z`;
        }

        const parsedRelative = !rawPostedAt && time ? parseJobPostedAt(time) : null;
        const postedAt = rawPostedAt || (parsedRelative ? parsedRelative.toISOString() : '');

        seenIds.add(id);

        jobs.push({
            id,
            platformId: 'mostaql',
            title: link.textContent.trim(),
            url,
            poster: posterEl?.textContent?.replace(/\s+/g, ' ').trim() || undefined,
            time: time || undefined,
            postedAt,
            bidsText: bidsText || undefined,
            budget: budgetEl?.textContent?.trim() || 'غير محدد',
            description: descEl?.textContent?.trim() || undefined,
        });
    });

    doc.querySelectorAll('tr').forEach((row) => {
        const extracted = extractMostaqlProjectLink(row);

        if (!extracted) {
            return;
        }

        const { link, url, id } = extracted;

        if (seenIds.has(id)) {
            return;
        }

        const userIcon = row.querySelector('.fa-user, .fa-user-circle');
        const posterEl =
            userIcon?.closest('td, li, span, div') ??
            row.querySelector('a[href*="/u/"], .project__author, bdi, td:nth-child(2)');
        const budgetEl = row.querySelector('td:nth-child(4), [class*="budget"]');
        const rawTimeEl = row.querySelector(
            'time, td:nth-child(5n), .timeSince, [class*="date"], [class*="time"]'
        );
        const timeEl = rawTimeEl?.querySelector('time') ?? rawTimeEl;
        const bidsEl = row.querySelector('td:nth-child(3), [class*="bid"]');

        const time = timeEl?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        let rawPostedAt =
            timeEl?.getAttribute('datetime') ??
            timeEl?.getAttribute('title') ??
            timeEl?.getAttribute('data-original-title') ??
            '';

        if (
            rawPostedAt &&
            /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?$/.test(rawPostedAt.trim())
        ) {
            rawPostedAt = `${rawPostedAt.trim().replace(/\s+/, 'T')}Z`;
        }

        const parsedRelative = !rawPostedAt && time ? parseJobPostedAt(time) : null;
        const postedAt = rawPostedAt || (parsedRelative ? parsedRelative.toISOString() : '');

        seenIds.add(id);

        jobs.push({
            id,
            platformId: 'mostaql',
            title: link.textContent.trim(),
            url,
            budget: budgetEl?.textContent?.trim() ?? 'غير محدد',
            time: time || undefined,
            postedAt,
            poster: posterEl?.textContent?.replace(/\s+/g, ' ').trim() || undefined,
            bidsText: bidsEl?.textContent?.replace(/\s+/g, ' ').trim() || undefined,
        });
    });

    if (jobs.length > 0) {
        return jobs;
    }

    doc.querySelectorAll('a[href*="/project/"], a[href*="/projects/"]').forEach((link) => {
        const href = link.getAttribute('href');
        if (!href || href.includes('/create') || href.includes('template=')) {
            return;
        }

        const url = resolveMostaqlProjectUrl(href);
        const id = url ? extractMostaqlProjectId(url) : null;
        const title = link.textContent.trim();

        if (!url || !id || seenIds.has(id) || title.length <= 5) {
            return;
        }

        seenIds.add(id);

        jobs.push({
            id,
            platformId: 'mostaql',
            title,
            url,
            budget: '',
            postedAt: '',
            poster: '',
            bidsText: '',
        });
    });

    return jobs;
}

export function parseMostaqlProjectHtml(html: string): Partial<JobRecord> | null {
    const doc = parseDocument(html);
    const statusLabel = doc.querySelector(
        '.label-prj-open, .label-prj-closed, .label-prj-completed, .label-prj-cancelled, .label-prj-underway, .label-prj-processing, .project-header .label, .project-status'
    );
    const descriptionEl = doc.querySelector('.project-post__body, #project-brief, .carda__content');
    const clientNameEl = doc.querySelector('.profile__name bdi, .profile__name a, a[href*="/u/"]');
    const timeEl = doc.querySelector(
        'time[itemprop="datePublished"], #project-meta-panel time, time'
    );

    let communications = '0';
    let hiringRate = '';
    let duration = 'غير محددة';
    let budget = '';
    let registrationDate = '';

    doc.querySelectorAll('.meta-row, .table-meta tr, li.meta-item').forEach((row) => {
        const text = row.textContent;
        const value = row.querySelector('.meta-value, td:last-child, .meta-item-value');

        if (!value) {
            return;
        }

        if (text.includes('التواصلات الجارية')) {
            communications = value.textContent.trim();
        } else if (text.includes('معدل التوظيف')) {
            hiringRate = value.textContent.trim();
        } else if (text.includes('مدة التنفيذ')) {
            duration = value.textContent.trim();
        } else if (text.includes('الميزانية')) {
            budget = value.textContent.trim();
        } else if (text.includes('تاريخ التسجيل')) {
            registrationDate = value.textContent.trim();
        }
    });

    if (!budget) {
        const explicitBudget = doc.querySelector('[data-type="project-budget_range"]');
        if (explicitBudget) {
            budget = explicitBudget.textContent.trim();
        }
    }

    let postedAt = timeEl?.getAttribute('datetime') ?? timeEl?.getAttribute('title') ?? undefined;
    if (postedAt && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?$/.test(postedAt.trim())) {
        postedAt = `${postedAt.trim().replace(/\s+/, 'T')}Z`;
    }

    return {
        platformId: 'mostaql',
        status: statusLabel?.textContent?.trim() ?? 'غير معروف',
        communications,
        hiringRate,
        description: descriptionEl?.textContent?.trim() ?? '',
        duration,
        budget,
        registrationDate,
        clientName: clientNameEl?.textContent?.trim() || undefined,
        postedAt,
    };
}
