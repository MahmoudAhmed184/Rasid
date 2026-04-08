const KAFIIL_PROJECT_PATH_PATTERN = /\/project\/(\d+)/;

export const KAFIIL_SELECTORS = {
    listing: {
        card: '.project-box',
        titleLink: 'a.name[href*="/project/"]',
        preview: '.inner .info-content',
        price: '.price',
        textRows: '.down .text',
        tag: '.tag',
    },
    project: {
        title: '.project-info-head .name b',
        categoryLink: '.project-info-head a[href*="category_id="]',
        timeRows: '.project-info-head .down .text',
        infoTable: '.info-table',
        descriptionBlock: '.block',
        blockHeadTitle: '.block-head .title',
        attachmentLinks: '.file-box[href]',
        skillTags: '.hashtags .hashtag',
    },
} as const;

export function extractKafiilProjectId(pathname: string): string {
    return pathname.match(KAFIIL_PROJECT_PATH_PATTERN)?.[1] ?? '';
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

export function queryAll<T extends Element>(root: ParentNode, selector: string): T[] {
    return [...root.querySelectorAll(selector)].filter(
        (element): element is T => element instanceof Element
    );
}
