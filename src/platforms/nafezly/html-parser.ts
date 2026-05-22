import type { JobRecord } from '../../entities/job/model';
import { resolvePlatformUrl } from '../../entities/platform/url';

const NAFEZLY_HOSTS = ['nafezly.com'] as const;
const NAFEZLY_BASE_URL = 'https://nafezly.com/';
const NAFEZLY_PROJECT_PATH_PATTERN = /^\/project\/\d+(?:[-/]|$)/;
const NAFEZLY_PROJECT_ID_PATTERN = /\/project\/(\d+)/;

function parseDocument(html: string): Document {
    return new DOMParser().parseFromString(html, 'text/html');
}

function normalizeText(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function resolveNafezlyProjectUrl(href: string | null): string | null {
    return resolvePlatformUrl(href, {
        baseUrl: NAFEZLY_BASE_URL,
        allowedHosts: NAFEZLY_HOSTS,
        pathPattern: NAFEZLY_PROJECT_PATH_PATTERN,
    });
}

function extractNafezlyProjectId(url: string): string | null {
    return new URL(url).pathname.match(NAFEZLY_PROJECT_ID_PATTERN)?.[1] ?? null;
}

function findSectionContent(doc: Document, headingText: string): HTMLElement | null {
    for (const block of doc.querySelectorAll<HTMLElement>('.main-nafez-box-styles')) {
        const heading = normalizeText(block.querySelector('.mb-1')?.textContent);

        if (!heading.includes(headingText)) {
            continue;
        }

        return block;
    }

    return null;
}

function parseDetailRows(section: ParentNode): Record<string, string> {
    const values: Record<string, string> = {};

    for (const row of section.querySelectorAll<HTMLElement>('.col-12.row')) {
        const columns = row.querySelectorAll<HTMLElement>(':scope > div');

        if (columns.length < 2) {
            continue;
        }

        const label = normalizeText(columns[0]?.textContent);
        const value = normalizeText(columns[1]?.textContent);

        if (label && value) {
            values[label] = value;
        }
    }

    return values;
}

export function parseNafezlyListingHtml(html: string): JobRecord[] {
    const doc = parseDocument(html);
    const jobs: JobRecord[] = [];
    const seenIds = new Set<string>();

    for (const card of doc.querySelectorAll<HTMLElement>('.project-box')) {
        const link =
            card.querySelector<HTMLAnchorElement>('a[href*="/project/"]') ??
            card.querySelector<HTMLAnchorElement>('a.text-truncate[href*="/project/"]');

        if (!link) {
            continue;
        }

        const url = resolveNafezlyProjectUrl(link.getAttribute('href'));
        const id = url ? extractNafezlyProjectId(url) : null;

        if (!url || !id || seenIds.has(id)) {
            continue;
        }

        seenIds.add(id);

        const preview = normalizeText(card.querySelector('h3.naskh')?.textContent);
        const poster = normalizeText(card.querySelector('a[href*="/u/"]')?.textContent);
        const metaText = [...card.querySelectorAll<HTMLElement>('span.kufi')]
            .map((element) => normalizeText(element.textContent))
            .filter(Boolean);

        const budget =
            metaText.find((text) => text.includes('$') || text.includes('دولار')) ?? undefined;
        const duration =
            metaText.find((text) => text.includes('يوم') || text.includes('أيام')) ?? undefined;
        const bidsText =
            metaText.find((text) => text.includes('عرض') || text.includes('عروض')) ?? undefined;
        const time =
            metaText.find((text) => text.includes('منذ') || text.includes('ساعة')) ?? undefined;

        jobs.push({
            id,
            platformId: 'nafezly',
            title: normalizeText(link.textContent),
            url,
            description: preview || undefined,
            poster: poster || undefined,
            budget,
            duration,
            bidsText,
            time,
        });
    }

    return jobs;
}

export function parseNafezlyProjectHtml(html: string): Partial<JobRecord> | null {
    const doc = parseDocument(html);
    const descriptionSection = findSectionContent(doc, 'تفاصيل المشروع');
    const projectCardSection = findSectionContent(doc, 'بطاقة المشروع');
    const ownerName = normalizeText(
        projectCardSection?.querySelector<HTMLElement>('a[href*="/u/"]')?.textContent
    );
    const detailRows = projectCardSection ? parseDetailRows(projectCardSection) : {};
    const description = normalizeText(
        descriptionSection?.querySelector<HTMLElement>('h2.naskh, h2')?.textContent
    );
    const tags = [
        ...doc.querySelectorAll<HTMLAnchorElement>('a.tag-class[href*="/projects/skill"]'),
    ]
        .map((link) => normalizeText(link.textContent))
        .filter(Boolean);

    if (!description && Object.keys(detailRows).length === 0 && !ownerName && tags.length === 0) {
        return null;
    }

    return {
        platformId: 'nafezly',
        description: description || undefined,
        status: detailRows['حالة المشروع'] || undefined,
        postedAt: detailRows['تاريخ النشر'] || undefined,
        duration: detailRows['المدة المتاحة'] || undefined,
        budget: detailRows['الميزانية'] || undefined,
        bidsText: detailRows['عدد المتقدمين'] || undefined,
        clientName: ownerName || undefined,
        tags: tags.length > 0 ? tags : undefined,
    };
}
