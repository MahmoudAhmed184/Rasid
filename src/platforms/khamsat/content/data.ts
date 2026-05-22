import type { ProjectAttachment } from '../../../entities/job/model';
import { resolvePlatformUrl } from '../../../entities/platform/url';
import type { PlatformPage, PlatformProposalSource } from '../../contracts';
import { KHAMSAT_SELECTORS, queryAll, queryFirst } from '../selectors';

const ATTACHMENT_FILE_PATTERN =
    /\.(pdf|docx?|xlsx?|csv|zip|rar|7z|txt|png|jpe?g|gif|webp|pptx?)($|\?)/i;
const KHAMSAT_TITLE_SUFFIX_PATTERN = /\s*[-|]\s*خمسات.*$/u;
const BREADCRUMB_IGNORED_LABELS = new Set([
    'الرئيسية',
    'خمسات',
    'مجتمع خمسات',
    'مجتمع',
    'طلبات الخدمات',
    'طلبات الخدمات غير الموجودة',
]);
const KHAMSAT_HOSTS = ['khamsat.com'] as const;

function normalizeText(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function resolveKhamsatUrl(href: string | null, baseUrl: URL): string | null {
    return resolvePlatformUrl(href, {
        baseUrl: baseUrl.href,
        allowedHosts: KHAMSAT_HOSTS,
    });
}

function getTitle(doc: Document): string {
    const titleElement = queryFirst<HTMLElement>(doc, KHAMSAT_SELECTORS.project.titleCandidates);

    if (titleElement) {
        const title = normalizeText(titleElement.textContent);

        if (title) {
            return title;
        }
    }

    return normalizeText(doc.title.replace(KHAMSAT_TITLE_SUFFIX_PATTERN, ''));
}

function getDescription(doc: Document): string {
    for (const selector of KHAMSAT_SELECTORS.project.descriptionCandidates) {
        const candidates = [...doc.querySelectorAll<HTMLElement>(selector)]
            .map((element) => normalizeText(element.textContent))
            .filter(Boolean);

        const detailedCandidate = candidates.find((text) => text.length >= 80);

        if (detailedCandidate) {
            return detailedCandidate;
        }

        if (candidates[0]) {
            return candidates[0];
        }
    }

    return '';
}

function getCategory(doc: Document): string | undefined {
    const labels = queryAll<HTMLAnchorElement>(doc, KHAMSAT_SELECTORS.project.categoryLinks)
        .map((link) => normalizeText(link.textContent))
        .filter((label) => label && !BREADCRUMB_IGNORED_LABELS.has(label));

    return labels.at(-1) || undefined;
}

function getClientName(doc: Document): string | undefined {
    const authorElement = queryFirst<HTMLElement>(doc, KHAMSAT_SELECTORS.project.authorCandidates);
    const clientName = normalizeText(authorElement?.textContent);

    return clientName || undefined;
}

function getPublishDate(doc: Document): string | undefined {
    const element = queryFirst<HTMLElement>(doc, KHAMSAT_SELECTORS.project.publishDateCandidates);

    if (!element) {
        return undefined;
    }

    const dateValue =
        element instanceof HTMLTimeElement
            ? element.dateTime || element.textContent
            : element.textContent;

    const publishDate = normalizeText(dateValue);
    return publishDate || undefined;
}

function getAttachments(doc: Document, url: URL): ProjectAttachment[] | undefined {
    const attachments = queryAll<HTMLAnchorElement>(doc, KHAMSAT_SELECTORS.project.attachmentLinks)
        .map((link) => {
            const href = link.getAttribute('href');
            const absoluteUrl = resolveKhamsatUrl(href, url);
            const name =
                normalizeText(link.textContent) ||
                normalizeText(absoluteUrl?.split('/').at(-1)?.split('?')[0]);

            return {
                name,
                url: absoluteUrl ?? '',
            } satisfies ProjectAttachment;
        })
        .filter(
            (attachment) =>
                Boolean(attachment.url) &&
                Boolean(attachment.name) &&
                ATTACHMENT_FILE_PATTERN.test(attachment.url)
        );

    if (attachments.length === 0) {
        return undefined;
    }

    return attachments.filter(
        (attachment, index, all) =>
            all.findIndex((candidate) => candidate.url === attachment.url) === index
    );
}

export function extractKhamsatProposalSource(input: {
    readonly page: Extract<PlatformPage, { readonly kind: 'project' }>;
    readonly document: Document;
    readonly url: URL;
}): PlatformProposalSource | null {
    const title = getTitle(input.document);
    const description = getDescription(input.document);

    if (!input.page.projectId || !title || !description) {
        return null;
    }

    const category = getCategory(input.document);
    const clientName = getClientName(input.document);
    const publishDate = getPublishDate(input.document);
    const attachments = getAttachments(input.document, input.url);

    return {
        trackedProject: {
            id: input.page.projectId,
            platformId: 'khamsat',
            title,
            url: input.url.href,
            lastChecked: new Date().toISOString(),
            category,
            clientName,
            publishDate,
            attachments,
        },
        aiContext: {
            title,
            description,
            url: input.url.href,
            projectId: input.page.projectId,
            category,
            clientName,
            publishDate,
            attachments,
        },
        minBudget: 5,
        durationDays: 0,
    };
}
