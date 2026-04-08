const KHAMSAT_REQUEST_PATH_PATTERN = /\/community\/requests\/(\d+)/;

export const KHAMSAT_SELECTORS = {
    project: {
        titleCandidates: ['h1', '.details-head', '.post-title', '.topic-title'],
        descriptionCandidates: [
            '[itemprop="articleBody"]',
            '.comment-body',
            '.topic-body',
            '.post-body',
            '.content-body',
            'article',
            'main article',
            'main .content',
        ],
        categoryLinks: [
            '.breadcrumb a',
            '.breadcrumbs a',
            '.c-breadcrumb a',
            'nav[aria-label="breadcrumb"] a',
        ],
        authorCandidates: [
            '.user-info .username',
            '.post-author .username',
            '.comment-user a',
            '.user-name',
            '.username',
            'a[href*="/user/"]',
            'a[href*="/users/"]',
        ],
        publishDateCandidates: ['time[datetime]', 'time', '.meta time', '.comment-time'],
        attachmentLinks: [
            '.attachments a[href]',
            '.uploaded-files a[href]',
            '.comment-attachments a[href]',
            'a[download]',
        ],
    },
    autofill: {
        proposalTextareas: [
            'textarea[name*="comment"]',
            'textarea[name*="reply"]',
            'textarea[name*="content"]',
            'form textarea',
            'textarea',
        ],
    },
    panel: {
        rootId: 'frelancia-khamsat-panel',
    },
} as const;

export function extractKhamsatProjectId(pathname: string): string {
    return pathname.match(KHAMSAT_REQUEST_PATH_PATTERN)?.[1] ?? '';
}

export function queryFirst<T extends Element>(
    root: ParentNode,
    selectors: readonly string[]
): T | null {
    for (const selector of selectors) {
        const element = root.querySelector(selector);

        if (element instanceof Element) {
            return element as T;
        }
    }

    return null;
}

export function queryAll<T extends Element>(root: ParentNode, selectors: readonly string[]): T[] {
    const matches: T[] = [];
    const seen = new Set<Element>();

    for (const selector of selectors) {
        for (const element of root.querySelectorAll(selector)) {
            if (!(element instanceof Element) || seen.has(element)) {
                continue;
            }

            seen.add(element);
            matches.push(element as T);
        }
    }

    return matches;
}
