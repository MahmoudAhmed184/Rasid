import { browser } from 'wxt/browser';

import { extractProjectData, getBudgetFromPage } from './data.mjs';
import { getProjectId, isContextValid } from './runtime.mjs';

// ==========================================
// mostaql/autofill.js — Bid form auto-fill
// ==========================================

const browserApi = browser;

function parseDurationDays(durationText) {
    if (!durationText) {
        return 0;
    }

    const match = String(durationText).match(/\d+/);
    if (match) {
        return parseInt(match[0], 10);
    }

    return String(durationText).includes('يوم واحد') ? 1 : 0;
}

export function checkForAutofill() {
    handleAutofillSequence();
}

function handleAutofillSequence() {
    if (!isContextValid()) {
        return;
    }

    browserApi.storage.local
        .get(['mostaql_pending_autofill'])
        .then((data) => {
            const autofill = data.mostaql_pending_autofill;
            if (!autofill) {
                return;
            }

            const currentProjectId = getProjectId();
            if (autofill.projectId !== currentProjectId) {
                return;
            }

            if (Date.now() - autofill.timestamp > 5 * 60 * 1000) {
                browserApi.storage.local.remove(['mostaql_pending_autofill']);
                return;
            }

            let attempts = 0;
            const maxAttempts = 20;

            const interval = setInterval(() => {
                const amountInput =
                    document.querySelector('input[name="cost"]') ||
                    document.querySelector('input[name="amount"]') ||
                    document.querySelector('#bid__cost') ||
                    document.querySelector('#amount');

                const durationInput =
                    document.querySelector('input[name="period"]') ||
                    document.querySelector('input[name="duration"]') ||
                    document.querySelector('#bid__period') ||
                    document.querySelector('#duration');

                if (amountInput && durationInput) {
                    clearInterval(interval);
                    amountInput.focus();
                    durationInput.focus();
                    void fillForm(amountInput, durationInput, autofill);
                } else {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        clearInterval(interval);
                    }
                }
            }, 500);
        })
        .catch(console.error);
}

async function fillForm(amountInput, durationInput, data) {
    const triggerEvents = (el) => {
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));
        setTimeout(() => {
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        }, 50);
    };

    let amountToFill = data.amount;

    if (!amountToFill || amountToFill === 0) {
        amountToFill = getBudgetFromPage();
    }

    if (amountToFill > 0) {
        amountInput.focus();
        amountInput.value = amountToFill;
        amountInput.classList.add('mostaql-autofilled');
        triggerEvents(amountInput);
    }

    setTimeout(() => {
        if (data.duration > 0) {
            durationInput.focus();
            durationInput.value = data.duration;
            durationInput.classList.add('mostaql-autofilled');
            triggerEvents(durationInput);
        }

        if (data.proposal) {
            const proposalTextarea =
                document.querySelector('#bid__details') ||
                document.querySelector('#description') ||
                document.querySelector('textarea[name="details"]') ||
                document.querySelector('textarea[name="description"]') ||
                document.querySelector('#proposal-description');
            if (proposalTextarea) {
                proposalTextarea.focus();
                proposalTextarea.value = data.proposal;
                proposalTextarea.classList.add('mostaql-autofilled');
                triggerEvents(proposalTextarea);
            }
        }
    }, 100);

    const form =
        document.querySelector('#add-proposal-form') ||
        amountInput.closest('form') ||
        amountInput.parentElement;
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const toast = document.createElement('div');
        toast.className = 'mostaql-autofill-toast';
        toast.innerHTML =
            '<i class="fa fa-magic"></i> <span>تم تعبئة تفاصيل العرض تلقائياً!</span>';
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }

    await browserApi.storage.local.remove(['mostaql_pending_autofill']);
}

export async function handleQuickBidClick() {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }

    const projectId = getProjectId();
    if (!projectId) {
        return;
    }

    const data = await browserApi.storage.local.get(['proposalTemplate']);
    const proposal =
        data.proposalTemplate ||
        `اطلعت على مشروعك وفهمت متطلباته جيدا، واذا انني قادر على تقديم العمل بطريقة منظمة وواضحة. احرص على الدقة لضمان ان تكون النتيجة مرضية تماما لك.

متحمس لبدء التعاون معك، واذاك بتنفيذ العمل بشكل سلس ومرتب. في انتظار تواصلك لترتيب التفاصيل والانطلاق مباشرة.`;

    const minBudget = getBudgetFromPage();
    const projectData = extractProjectData();
    await queueProposalAutofill({
        projectId,
        proposal,
        amount: minBudget,
        duration: parseDurationDays(projectData.duration),
    });
}

export async function queueProposalAutofill({
    projectId,
    proposal,
    amount = 0,
    duration = 0,
}) {
    const autofillData = {
        projectId,
        amount,
        duration,
        proposal,
        timestamp: Date.now(),
    };

    await browserApi.storage.local.set({ mostaql_pending_autofill: autofillData });
    handleAutofillSequence();
}
