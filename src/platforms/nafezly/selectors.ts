const NAFEZLY_PROJECT_PATH_PATTERN = /\/project\/(\d+)/;

export const NAFEZLY_SELECTORS = {
    project: {
        sectionBlocks: '.main-nafez-box-styles',
        sectionHeading: '.mb-1',
        descriptionContent: 'h2.naskh, h2[style*="white-space: pre-line"]',
        skillLinks: 'a.tag-class[href*="/projects/skill"]',
        ownerLinks: 'a[href*="/u/"]',
        authMeta: 'meta[name="is_auth"]',
        offerSection: '#add-offer',
    },
    autofill: {
        proposalTextareas: [
            '#offer-form textarea',
            'textarea[name="details"]',
            'textarea[name="description"]',
            'textarea[name="content"]',
            'textarea[name="offer"]',
            'form textarea',
        ],
        amountInputs: [
            '#offer-form input[name="price"]',
            '#offer-form input[name="budget"]',
            '#offer-form input[name="cost"]',
            '#offer-form input[type="number"]',
        ],
        durationInputs: [
            '#offer-form input[name="duration"]',
            '#offer-form input[name="days"]',
            '#offer-form input[name="period"]',
        ],
    },
    panel: {
        rootId: 'rasid-nafezly-panel',
    },
} as const;

export function extractNafezlyProjectId(pathname: string): string {
    return pathname.match(NAFEZLY_PROJECT_PATH_PATTERN)?.[1] ?? '';
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
