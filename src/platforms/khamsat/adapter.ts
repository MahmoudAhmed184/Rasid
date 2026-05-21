import { browser } from 'wxt/browser';

import { setFormControlValue } from '../../shared/dom/form-events';
import type {
    AutofillApplyResult,
    PlatformAdapter,
    PlatformAutofillDraft,
    PlatformContributionMountResult,
    PlatformPage,
    PlatformUiContribution,
} from '../contracts';
import { mountKhamsatProjectPanel } from './content/project-panel';
import { extractKhamsatProposalSource } from './content/data';
import { extractKhamsatProjectId, KHAMSAT_SELECTORS, queryFirst } from './selectors';

const KHAMSAT_MATCHES = ['https://khamsat.com/*'] as const;
const KHAMSAT_AUTOFILLED_CLASS = 'rasid-autofilled';

function isContextValid(): boolean {
    try {
        return Boolean(browser.runtime?.id && browser.storage);
    } catch {
        return false;
    }
}

function matchPage(url: URL): PlatformPage {
    const projectId = extractKhamsatProjectId(url.pathname);

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

const khamsatUi = [
    {
        id: 'khamsat.project-panel',
        pages: ['project'],
        mount(input) {
            if (input.page.kind !== 'project') {
                return {
                    kind: 'deferred',
                } satisfies PlatformContributionMountResult;
            }

            const dispose = mountKhamsatProjectPanel({
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

async function applyProposalAutofill(input: {
    readonly page: Extract<PlatformPage, { readonly kind: 'project' }>;
    readonly document: Document;
    readonly draft: PlatformAutofillDraft;
}): Promise<AutofillApplyResult> {
    if (input.draft.projectId !== input.page.projectId) {
        return {
            kind: 'not-available',
            reason: 'Autofill draft does not belong to the current request page.',
        };
    }

    const proposalTextarea = queryFirst<HTMLTextAreaElement>(
        input.document,
        KHAMSAT_SELECTORS.autofill.proposalTextareas
    );

    if (!proposalTextarea) {
        return {
            kind: 'retry',
            reason: 'Reply textarea is not ready yet.',
        };
    }

    if (input.draft.proposal) {
        setFormControlValue(proposalTextarea, input.draft.proposal, {
            highlightClassName: KHAMSAT_AUTOFILLED_CLASS,
            includeKeyboardEvents: true,
        });
    }

    const targetContainer = proposalTextarea.closest('form') ?? proposalTextarea.parentElement;

    if (targetContainer instanceof HTMLElement) {
        targetContainer.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }

    return {
        kind: 'applied',
    };
}

export const khamsatAdapter = {
    id: 'khamsat',
    displayName: 'Khamsat',
    matches: KHAMSAT_MATCHES,
    isContextValid,
    matchPage({ url }) {
        return matchPage(url);
    },
    extractProposalSource(input) {
        return extractKhamsatProposalSource(input);
    },
    ui: khamsatUi,
    applyProposalAutofill,
} satisfies PlatformAdapter;
