import type { JobRecord } from '../../models/jobs';

function parseDocument(html: string): Document {
    return new DOMParser().parseFromString(html, 'text/html');
}

function normalizeText(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function absoluteKhamsatUrl(href: string | null): string {
    if (!href) {
        return '';
    }

    return href.startsWith('http') ? href : `https://khamsat.com${href}`;
}

export function parseKhamsatListingHtml(html: string): JobRecord[] {
    const doc = parseDocument(html);
    const jobs: JobRecord[] = [];
    const seenIds = new Set<string>();

    doc.querySelectorAll('tr.forum_post').forEach((row) => {
        const link = row.querySelector<HTMLAnchorElement>(
            '.details-head a[href*="/community/requests/"]'
        );

        if (!link) {
            return;
        }

        const href = link.getAttribute('href');
        const match = href?.match(/\/community\/requests\/(\d+)/);

        if (!match || seenIds.has(match[1])) {
            return;
        }

        const detailsCell = row.querySelector('.details-td');
        const ownerLink = detailsCell?.querySelector<HTMLAnchorElement>('.details-list a.user');
        const publishTime =
            detailsCell?.querySelector<HTMLSpanElement>('.details-list span[title]') ?? null;

        seenIds.add(match[1]);

        jobs.push({
            id: match[1],
            platformId: 'khamsat',
            title: normalizeText(link.textContent),
            url: absoluteKhamsatUrl(href),
            poster: normalizeText(ownerLink?.textContent),
            time: normalizeText(publishTime?.textContent),
            postedAt: normalizeText(publishTime?.getAttribute('title')),
        });
    });

    return jobs;
}

export function parseKhamsatProjectHtml(html: string): Partial<JobRecord> | null {
    const doc = parseDocument(html);
    const descriptionSelectors = [
        '.card-body > article.replace_urls',
        '.card-body .replace_urls',
        'article.replace_urls',
        '[itemprop="articleBody"]',
        '.topic-body',
        '.post-body',
        '.content-body',
        '.comment-body',
        'article',
        'main article',
        'main .content',
    ];
    const description =
        descriptionSelectors
            .flatMap((selector) => {
                const texts = [...doc.querySelectorAll<HTMLElement>(selector)]
                    .map((element) => normalizeText(element.textContent))
                    .filter(Boolean);

                const detailedCandidate = texts.find((text) => text.length >= 80);
                return detailedCandidate ? [detailedCandidate] : texts.slice(0, 1);
            })[0] ?? '';
    const clientName = normalizeText(
        doc.querySelector<HTMLElement>(
            '.user-info .username, .post-author .username, .comment-user a, .user-name, .username, a[href*="/user/"], a[href*="/users/"]'
        )?.textContent
    );
    const publishDate = normalizeText(
        doc
            .querySelector<HTMLElement>('time[datetime], time, .meta time, .comment-time')
            ?.getAttribute('datetime') ??
            doc.querySelector<HTMLElement>('time[datetime], time, .meta time, .comment-time')
                ?.textContent
    );

    const attachments = [
        ...doc.querySelectorAll<HTMLAnchorElement>(
            'a[download], .attachments a[href], .uploaded-files a[href]'
        ),
    ]
        .map((link) => {
            const url = absoluteKhamsatUrl(link.getAttribute('href'));
            const name = normalizeText(link.textContent) || normalizeText(url.split('/').at(-1));

            return {
                name,
                url,
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
