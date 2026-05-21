import { setFormControlValue } from '../../../shared/dom/form-events';
import type { AutofillApplyResult, PlatformAutofillDraft, PlatformPage } from '../../contracts';
import { NAFEZLY_SELECTORS, queryFirst } from '../selectors';

const NAFEZLY_AUTOFILLED_CLASS = 'rasid-nafezly-autofilled';

function getAuthState(doc: Document): boolean {
    return doc.querySelector<HTMLMetaElement>(NAFEZLY_SELECTORS.project.authMeta)?.content === '1';
}

export async function applyNafezlyProposalAutofill(input: {
    readonly page: Extract<PlatformPage, { readonly kind: 'project' }>;
    readonly document: Document;
    readonly draft: PlatformAutofillDraft;
}): Promise<AutofillApplyResult> {
    if (input.draft.projectId !== input.page.projectId) {
        return {
            kind: 'not-available',
            reason: 'Autofill draft does not belong to the current project page.',
        };
    }

    if (!getAuthState(input.document)) {
        return {
            kind: 'not-available',
            reason: 'Nafezly proposal autofill requires a logged-in session.',
        };
    }

    const proposalTextarea = queryFirst<HTMLTextAreaElement>(
        input.document,
        NAFEZLY_SELECTORS.autofill.proposalTextareas
    );

    if (!proposalTextarea) {
        return {
            kind: 'retry',
            reason: 'Offer form textarea is not ready yet.',
        };
    }

    const amountInput = queryFirst<HTMLInputElement>(
        input.document,
        NAFEZLY_SELECTORS.autofill.amountInputs
    );
    const durationInput = queryFirst<HTMLInputElement>(
        input.document,
        NAFEZLY_SELECTORS.autofill.durationInputs
    );

    if (input.draft.proposal) {
        setFormControlValue(proposalTextarea, input.draft.proposal, {
            highlightClassName: NAFEZLY_AUTOFILLED_CLASS,
            includeKeyboardEvents: true,
        });
    }

    if (amountInput && input.draft.amount > 0) {
        setFormControlValue(amountInput, String(input.draft.amount), {
            highlightClassName: NAFEZLY_AUTOFILLED_CLASS,
            includeKeyboardEvents: true,
        });
    }

    if (durationInput && input.draft.durationDays > 0) {
        setFormControlValue(durationInput, String(input.draft.durationDays), {
            highlightClassName: NAFEZLY_AUTOFILLED_CLASS,
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
