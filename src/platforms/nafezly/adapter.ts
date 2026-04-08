import { browser } from 'wxt/browser';

import { applyNafezlyProposalAutofill } from './content/autofill';
import { extractNafezlyProposalSource } from './content/data';
import { mountNafezlyProjectPanel } from './content/project-panel';
import { extractNafezlyProjectId, NAFEZLY_SELECTORS } from './selectors';
import type {
    PlatformAdapter,
    PlatformContributionMountResult,
    PlatformPage,
    PlatformUiContribution,
} from '../contracts';

const NAFEZLY_MATCHES = ['https://nafezly.com/*'] as const;

function isContextValid(): boolean {
    try {
        return Boolean(browser.runtime?.id && browser.storage);
    } catch {
        return false;
    }
}

function matchPage(url: URL): PlatformPage {
    const projectId = extractNafezlyProjectId(url.pathname);

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

const nafezlyUi = [
    {
        id: 'nafezly.project-panel',
        pages: ['project'],
        mount(input) {
            if (input.page.kind !== 'project') {
                return {
                    kind: 'deferred',
                } satisfies PlatformContributionMountResult;
            }

            if (!input.document.querySelector(NAFEZLY_SELECTORS.project.offerSection)) {
                return {
                    kind: 'deferred',
                } satisfies PlatformContributionMountResult;
            }

            const dispose = mountNafezlyProjectPanel({
                page: input.page,
                document: input.document,
                services: input.services,
            });

            return {
                kind: 'mounted',
                dispose,
            } satisfies PlatformContributionMountResult;
        },
    },
] as const satisfies readonly PlatformUiContribution[];

export const nafezlyAdapter = {
    id: 'nafezly',
    displayName: 'Nafezly',
    matches: NAFEZLY_MATCHES,
    isContextValid,
    matchPage({ url }) {
        return matchPage(url);
    },
    extractProposalSource(input) {
        return extractNafezlyProposalSource(input);
    },
    ui: nafezlyUi,
    applyProposalAutofill(input) {
        return applyNafezlyProposalAutofill(input);
    },
} satisfies PlatformAdapter;
