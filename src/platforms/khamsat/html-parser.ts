import type { JobRecord } from '../../entities/job/model';
import { resolvePlatformUrl } from '../../entities/platform/url';
import { KHAMSAT_SELECTORS, queryAll, queryFirst } from './selectors';

const KHAMSAT_HOSTS = ['khamsat.com'] as const;
const KHAMSAT_BASE_URL = 'https://khamsat.com/';
const KHAMSAT_REQUEST_PATH_PATTERN = /^\/community\/requests\/\d+(?:[-/]|$)/;
const KHAMSAT_REQUEST_ID_PATTERN = /\/community\/requests\/(\d+)/;

function parseDocument(html: string): Document {
    return new DOMParser().parseFromString(html, 'text/html');
}

function normalizeText(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function resolveKhamsatRequestUrl(href: string | null): string | null {
    return resolvePlatformUrl(href, {
        baseUrl: KHAMSAT_BASE_URL,
        allowedHosts: KHAMSAT_HOSTS,
        pathPattern: KHAMSAT_REQUEST_PATH_PATTERN,
    });
}

function resolveKhamsatUrl(href: string | null): string | null {
    return resolvePlatformUrl(href, {
        baseUrl: KHAMSAT_BASE_URL,
        allowedHosts: KHAMSAT_HOSTS,
    });
}

function extractKhamsatRequestId(url: string): string | null {
    return new URL(url).pathname.match(KHAMSAT_REQUEST_ID_PATTERN)?.[1] ?? null;
}

function findKhamsatSidebarPublishDate(doc: Document): string {
    for (const sidebar of queryAll<HTMLElement>(doc, KHAMSAT_SELECTORS.project.sidebarContainers)) {
        for (const titledValue of sidebar.querySelectorAll<HTMLElement>('span[title]')) {
            const metadataRow =
                titledValue.closest('li, tr, .media, .d-flex, .row, p, div') ??
                titledValue.parentElement;
            const rowText = normalizeText(metadataRow?.textContent);

            if (!rowText.includes('تاريخ النشر')) {
                continue;
            }

            return normalizeText(titledValue.getAttribute('title')) || normalizeText(titledValue.textContent);
        }
    }

    return '';
}

export function parseKhamsatListingHtml(html: string): JobRecord[] {
    const doc = parseDocument(html);
    const jobs: JobRecord[] = [];
    const seenIds = new Set<string>();

    doc.querySelectorAll(KHAMSAT_SELECTORS.listing.rows).forEach((row) => {
        const link = queryFirst<HTMLAnchorElement>(row, KHAMSAT_SELECTORS.listing.requestLinks);

        if (!link) {
            return;
        }

        const url = resolveKhamsatRequestUrl(link.getAttribute('href'));
        const id = url ? extractKhamsatRequestId(url) : null;

        if (!url || !id || seenIds.has(id)) {
            return;
        }

        const detailsCell = row.querySelector(KHAMSAT_SELECTORS.listing.detailsCell);
        const ownerLink = detailsCell?.querySelector<HTMLAnchorElement>(
            KHAMSAT_SELECTORS.listing.ownerLink
        );
        const publishTime =
            detailsCell?.querySelector<HTMLSpanElement>(
                KHAMSAT_SELECTORS.listing.lastInteractionTime
            ) ?? null;

        seenIds.add(id);

        jobs.push({
            id,
            platformId: 'khamsat',
            title: normalizeText(link.textContent),
            url,
            poster: normalizeText(ownerLink?.textContent),
            time: normalizeText(publishTime?.textContent),
            lastInteractionAt: normalizeText(publishTime?.getAttribute('title')),
        });
    });

    return jobs;
}

export function parseKhamsatProjectHtml(html: string): Partial<JobRecord> | null {
    const doc = parseDocument(html);
    const description =
        KHAMSAT_SELECTORS.project.descriptionCandidates
            .flatMap((selector) => {
                const texts = [...doc.querySelectorAll<HTMLElement>(selector)]
                    .map((element) => normalizeText(element.textContent))
                    .filter(Boolean);

                const detailedCandidate = texts.find((text) => text.length >= 80);
                return detailedCandidate ? [detailedCandidate] : texts.slice(0, 1);
            })[0] ?? '';
    const clientName = normalizeText(
        queryFirst<HTMLElement>(doc, KHAMSAT_SELECTORS.project.sidebarOwnerLinks)?.textContent ??
            queryFirst<HTMLElement>(doc, KHAMSAT_SELECTORS.project.authorCandidates)?.textContent
    );
    const publishDateEl = queryFirst<HTMLElement>(
        doc,
        KHAMSAT_SELECTORS.project.publishDateCandidates
    );
    const publishDate =
        findKhamsatSidebarPublishDate(doc) ||
        normalizeText(publishDateEl?.getAttribute('datetime') ?? publishDateEl?.textContent);

    const attachments = queryAll<HTMLAnchorElement>(
        doc,
        KHAMSAT_SELECTORS.project.attachmentLinks
    )
        .map((link) => {
            const url = resolveKhamsatUrl(link.getAttribute('href'));
            const name = normalizeText(link.textContent) || normalizeText(url?.split('/').at(-1));

            return {
                name,
                url: url ?? '',
            };
        })
        .filter((attachment) => attachment.url.length > 0);

    if (!description && !clientName && !publishDate && attachments.length === 0) {
        return null;
    }

    return {
        platformId: 'khamsat',
        description: description || undefined,
        clientName: clientName || undefined,
        postedAt: publishDate || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
    };
}
