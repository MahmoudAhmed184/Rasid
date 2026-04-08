import type { JobRecord } from '../../models/jobs';

function parseDocument(html: string): Document {
    return new DOMParser().parseFromString(html, 'text/html');
}

function normalizeText(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function absoluteKafiilUrl(href: string | null): string {
    if (!href) {
        return '';
    }

    return href.startsWith('http') ? href : `https://kafiil.com${href}`;
}

function findBlockContent(doc: Document, headingText: string): HTMLElement | null {
    for (const block of doc.querySelectorAll<HTMLElement>('.block')) {
        const heading = normalizeText(block.querySelector('.block-head .title')?.textContent);

        if (heading.includes(headingText)) {
            return block;
        }
    }

    return null;
}

function parseInfoTable(section: ParentNode): Record<string, string> {
    const values: Record<string, string> = {};

    for (const row of section.querySelectorAll<HTMLTableRowElement>('tr')) {
        const columns = row.querySelectorAll<HTMLTableCellElement>('td');

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

export function parseKafiilListingHtml(html: string): JobRecord[] {
    const doc = parseDocument(html);
    const jobs: JobRecord[] = [];
    const seenIds = new Set<string>();

    for (const card of doc.querySelectorAll<HTMLElement>('.project-box')) {
        const link = card.querySelector<HTMLAnchorElement>('a.name[href*="/project/"]');

        if (!link) {
            continue;
        }

        const href = link.getAttribute('href');
        const id = href?.match(/\/project\/(\d+)/)?.[1] ?? '';

        if (!id || seenIds.has(id)) {
            continue;
        }

        seenIds.add(id);

        const textRows = [...card.querySelectorAll<HTMLElement>('.down .text')].map((element) =>
            normalizeText(element.textContent)
        );

        jobs.push({
            id,
            platformId: 'kafiil',
            title: normalizeText(link.textContent),
            url: absoluteKafiilUrl(href),
            description:
                normalizeText(card.querySelector('.inner .info-content')?.textContent) || undefined,
            poster: normalizeText(card.querySelector('.down a.user')?.textContent) || undefined,
            status: normalizeText(card.querySelector('.tag')?.textContent) || undefined,
            budget: normalizeText(card.querySelector('.price')?.textContent) || undefined,
            time: textRows.find((text) => text.includes('منذ')) || undefined,
            bidsText:
                textRows.find((text) => text.includes('عرض') || text.includes('عروض')) || undefined,
        });
    }

    return jobs;
}

export function parseKafiilProjectHtml(html: string): Partial<JobRecord> | null {
    const doc = parseDocument(html);
    const descriptionBlock = findBlockContent(doc, 'تفاصيل المشروع');
    const infoBlock = findBlockContent(doc, 'معلومات المشروع');
    const infoValues = infoBlock ? parseInfoTable(infoBlock) : {};
    const title = normalizeText(doc.querySelector('.project-info-head .name b')?.textContent);
    const category = normalizeText(
        doc.querySelector('.project-info-head a[href*="category_id="]')?.textContent
    );
    const description = normalizeText(descriptionBlock?.querySelector('.has-padding p')?.textContent);
    const tags = [...doc.querySelectorAll<HTMLAnchorElement>('.hashtags .hashtag')]
        .map((link) => normalizeText(link.textContent))
        .filter(Boolean);
    const attachments = [...doc.querySelectorAll<HTMLAnchorElement>('.file-box[href]')]
        .map((link) => ({
            name: normalizeText(link.querySelector('.info-content')?.textContent),
            url: absoluteKafiilUrl(link.getAttribute('href')),
        }))
        .filter((attachment) => attachment.name && attachment.url);

    if (!title && !description && Object.keys(infoValues).length === 0 && tags.length === 0) {
        return null;
    }

    return {
        platformId: 'kafiil',
        title: title || undefined,
        category: category || undefined,
        description: description || undefined,
        postedAt: infoValues['تاريخ النشر'] || undefined,
        budget: infoValues['الميزانية'] || undefined,
        duration: infoValues['مدة المشروع'] || undefined,
        bidsText: infoValues['عدد العروض'] || undefined,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
    };
}
