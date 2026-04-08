import type { PlatformContentServices } from '../../contracts';
import { parseDurationDays } from '../../../shared/parsing/duration';
import { extractProjectData, getBudgetFromPage } from './data';
import { getProjectId, isContextValid } from './runtime';

// ==========================================
// mostaql/autofill.js — Bid form auto-fill
// ==========================================

type ProposalServices = PlatformContentServices['proposals'];

export async function handleQuickBidClick(proposals: ProposalServices) {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }

    const projectId = getProjectId();
    if (!projectId) {
        return;
    }

    const proposal = await proposals.getQuickTemplate();

    const minBudget = getBudgetFromPage();
    const projectData = extractProjectData();
    await queueProposalAutofill({
        proposals,
        projectId,
        proposal,
        amount: minBudget,
        duration: parseDurationDays(projectData.duration),
    });
}

export async function queueProposalAutofill({
    proposals,
    projectId,
    proposal,
    amount = 0,
    duration = 0,
}: {
    proposals: ProposalServices;
    projectId: string;
    proposal: string;
    amount?: number;
    duration?: number;
}): Promise<void> {
    await proposals.queueAutofill({
        platformId: 'mostaql',
        projectId,
        amount,
        durationDays: duration,
        proposal,
        createdAt: Date.now(),
    });
}
