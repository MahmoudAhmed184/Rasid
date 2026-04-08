import { browser } from 'wxt/browser';

import { extractKafiilProjectId } from './selectors';
import type { PlatformAdapter, PlatformPage } from '../contracts';

const KAFIIL_MATCHES = ['https://kafiil.com/*'] as const;

function isContextValid(): boolean {
    try {
        return Boolean(browser.runtime?.id && browser.storage);
    } catch {
        return false;
    }
}

function matchPage(url: URL): PlatformPage {
    const projectId = extractKafiilProjectId(url.pathname);

    if (projectId) {
        return {
            kind: 'project',
            key: `project:${projectId}`,
            projectId,
        };
    }

    return {
        kind: 'other',
        key: url.pathname || 'other',
    };
}

export const kafiilAdapter = {
    id: 'kafiil',
    displayName: 'Kafiil',
    matches: KAFIIL_MATCHES,
    isContextValid,
    matchPage({ url }) {
        return matchPage(url);
    },
    extractProposalSource() {
        return null;
    },
    ui: [],
    async applyProposalAutofill() {
        return {
            kind: 'not-available',
            reason: 'Kafiil proposal autofill is not implemented in the monitoring-only release.',
        } as const;
    },
} satisfies PlatformAdapter;
