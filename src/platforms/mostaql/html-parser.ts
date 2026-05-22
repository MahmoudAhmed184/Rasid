import type { JobRecord } from '../../entities/job/model';
import { resolvePlatformUrl } from '../../entities/platform/url';

const MOSTAQL_HOSTS = ['mostaql.com'] as const;
const MOSTAQL_BASE_URL = 'https://mostaql.com/';
const MOSTAQL_PROJECT_PATH_PATTERN = /^\/projects?\/\d+(?:[-/]|$)/;
const MOSTAQL_PROJECT_ID_PATTERN = /\/projects?\/(\d+)/;

function parseDocument(html: string): Document {
    return new DOMParser().parseFromString(html, 'text/html');
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

export function parseMostaqlListingHtml(html: string): JobRecord[] {
    const doc = parseDocument(html);
    const jobs: JobRecord[] = [];
    const seenIds = new Set<string>();

    doc.querySelectorAll('.list-group-item').forEach((item) => {
        const link = item.querySelector('a[href*="/project/"]');

        if (!link) {
            return;
        }

        const url = resolveMostaqlProjectUrl(link.getAttribute('href'));
        const id = url ? extractMostaqlProjectId(url) : null;

        if (!url || !id || seenIds.has(id)) {
            return;
        }

        const userIcon = item.querySelector('.fa-user');
        const timeEl = item.querySelector('time');
        const metaItems = item.querySelectorAll('.project__meta li');

        seenIds.add(id);

        jobs.push({
            id,
            platformId: 'mostaql',
            title: link.textContent.trim(),
            url,
            poster: userIcon?.parentElement?.textContent?.replace(/\s+/g, ' ').trim(),
            time: timeEl?.textContent?.replace(/\s+/g, ' ').trim(),
            postedAt: timeEl?.getAttribute('datetime') ?? '',
            bidsText:
                metaItems.length >= 3 ? metaItems[2]?.textContent?.replace(/\s+/g, ' ').trim() : '',
            budget: 'غير محدد',
        });
    });

    doc.querySelectorAll('tr').forEach((row) => {
        const link = row.querySelector('a[href*="/project/"]');

        if (!link) {
            return;
        }

        const url = resolveMostaqlProjectUrl(link.getAttribute('href'));
        const id = url ? extractMostaqlProjectId(url) : null;

        if (!url || !id || seenIds.has(id)) {
            return;
        }

        const budgetEl = row.querySelector('td:nth-child(4), [class*="budget"]');
        const timeEl = row.querySelector('td:nth-child(5n), .timeSince, [class*="date"]');

        seenIds.add(id);

        jobs.push({
            id,
            platformId: 'mostaql',
            title: link.textContent.trim(),
            url,
            budget: budgetEl?.textContent?.trim() ?? 'غير محدد',
            time: timeEl?.textContent?.trim() ?? '',
            postedAt: '',
            poster: '',
            bidsText: '',
        });
    });

    if (jobs.length > 0) {
        return jobs;
    }

    doc.querySelectorAll('a[href*="/project/"]').forEach((link) => {
        const url = resolveMostaqlProjectUrl(link.getAttribute('href'));
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
        '.label-prj-open, .label-prj-closed, .label-prj-completed, .label-prj-cancelled, .label-prj-underway, .label-prj-processing'
    );
    const descriptionEl = doc.querySelector('.project-post__body');

    let communications = '0';
    let hiringRate = '';
    let duration = 'غير محددة';
    let budget = '';
    let registrationDate = '';

    doc.querySelectorAll('.meta-row, .table-meta tr').forEach((row) => {
        const text = row.textContent;
        const value = row.querySelector('.meta-value, td:last-child');

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

    return {
        platformId: 'mostaql',
        status: statusLabel?.textContent?.trim() ?? 'غير معروف',
        communications,
        hiringRate,
        description: descriptionEl?.textContent?.trim() ?? '',
        duration,
        budget,
        registrationDate,
    };
}
