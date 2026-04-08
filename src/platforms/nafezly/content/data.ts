import { parseBudgetFloor } from '../../../shared/parsing/numbers';
import { parseDurationDays } from '../../../shared/parsing/duration';
import type { PlatformPage, PlatformProposalSource } from '../../contracts';

function normalizeText(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function findSection(doc: Document, headingText: string): HTMLElement | null {
    for (const block of doc.querySelectorAll<HTMLElement>('.main-nafez-box-styles')) {
        const heading = normalizeText(block.querySelector('.mb-1')?.textContent);

        if (heading.includes(headingText)) {
            return block;
        }
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

function getTitle(doc: Document): string {
    const metaTitle = doc.querySelector<HTMLMetaElement>('meta[name="nafezly-title"]')?.content;
    const documentTitle = doc.title.replace(/\s*\|\s*نفذلي.*$/u, '');

    return normalizeText(metaTitle || documentTitle || doc.querySelector('h1')?.textContent);
}

function getDescription(doc: Document): string {
    return normalizeText(findSection(doc, 'تفاصيل المشروع')?.querySelector('h2.naskh, h2')?.textContent);
}

export function extractNafezlyProposalSource(input: {
    readonly page: Extract<PlatformPage, { readonly kind: 'project' }>;
    readonly document: Document;
    readonly url: URL;
}): PlatformProposalSource | null {
    const title = getTitle(input.document);
    const description = getDescription(input.document);
    const projectCard = findSection(input.document, 'بطاقة المشروع');
    const projectDetails = projectCard ? parseDetailRows(projectCard) : {};
    const tags = [...input.document.querySelectorAll<HTMLAnchorElement>('a.tag-class[href*="/projects/skill"]')]
        .map((link) => normalizeText(link.textContent))
        .filter(Boolean);
    const clientName = normalizeText(projectCard?.querySelector('a[href*="/u/"]')?.textContent);
    const budget = projectDetails['الميزانية'] || '';
    const duration = projectDetails['المدة المتاحة'] || '';
    const publishDate = projectDetails['تاريخ النشر'] || '';
    const projectStatus = projectDetails['حالة المشروع'] || '';

    if (!title || !description || !input.page.projectId) {
        return null;
    }

    return {
        trackedProject: {
            id: input.page.projectId,
            platformId: 'nafezly',
            title,
            url: input.url.href,
            budget: budget || undefined,
            duration: duration || undefined,
            publishDate: publishDate || undefined,
            status: projectStatus || undefined,
            clientName: clientName || undefined,
            tags: tags.join(', ') || undefined,
            lastChecked: new Date().toISOString(),
        },
        aiContext: {
            title,
            description,
            url: input.url.href,
            projectId: input.page.projectId,
            budget: budget || undefined,
            duration: duration || undefined,
            publishDate: publishDate || undefined,
            projectStatus: projectStatus || undefined,
            clientName: clientName || undefined,
            tags,
        },
        minBudget: parseBudgetFloor(budget),
        durationDays: parseDurationDays(duration),
    };
}
