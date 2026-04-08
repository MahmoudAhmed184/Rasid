import type { GenerateProposalResponse } from '../proposals/proposal-contract';
import {
    requestDownloadZip,
    requestGenerateProposal,
} from '../runtime/background-messages';
import type { AiRequestContext } from '../../models/ai';
import type { PromptRepository } from '../../infrastructure/storage/repositories/prompt-repository';
import type { ProposalRepository } from '../../infrastructure/storage/repositories/proposal-repository';
import type { TrackingRepository } from '../../infrastructure/storage/repositories/tracking-repository';
import type {
    PlatformAutofillDraft,
    PlatformContentServices,
    PlatformPromptDraft,
    ProposalGenerationResult,
} from '../../platforms/contracts';

interface PlatformContentServiceDependencies {
    readonly promptRepository: Pick<PromptRepository, 'list' | 'save'>;
    readonly proposalRepository: Pick<
        ProposalRepository,
        'getQuickTemplate' | 'queueAutofill' | 'setPendingBridgePrompt'
    >;
    readonly trackingRepository: Pick<TrackingRepository, 'list' | 'isTracked' | 'toggle'>;
}

function normalizeProposalGenerationResult(
    response: GenerateProposalResponse
): ProposalGenerationResult {
    if (!response.success) {
        return {
            kind: 'error',
            message: response.error ?? 'Unknown AI generation error.',
        };
    }

    if (response.mode === 'direct') {
        return {
            kind: 'direct',
            proposal: response.proposal,
            provider: response.provider,
            model: response.model,
        };
    }

    return {
        kind: 'bridge',
        prompt: response.prompt,
        chatUrl: response.chatUrl,
    };
}

export function createPlatformContentServices(
    deps: PlatformContentServiceDependencies
): PlatformContentServices {
    return {
        prompts: {
            list() {
                return deps.promptRepository.list();
            },
            save(draft: PlatformPromptDraft) {
                return deps.promptRepository.save(draft);
            },
        },
        tracking: {
            list() {
                return deps.trackingRepository.list();
            },
            isTracked(projectId, platformId) {
                return deps.trackingRepository.isTracked(projectId, platformId);
            },
            toggle(project) {
                return deps.trackingRepository.toggle(project);
            },
        },
        proposals: {
            getQuickTemplate() {
                return deps.proposalRepository.getQuickTemplate();
            },
            async generate(templateId: string, context: AiRequestContext) {
                const response = await requestGenerateProposal({
                    templateId,
                    context,
                });

                return normalizeProposalGenerationResult(response);
            },
            queueAutofill(draft: PlatformAutofillDraft) {
                return deps.proposalRepository.queueAutofill(draft);
            },
            setPendingBridgePrompt(prompt: string) {
                return deps.proposalRepository.setPendingBridgePrompt(prompt);
            },
        },
        downloads: {
            async downloadZip(filename, files) {
                const result = await requestDownloadZip(filename, files);

                if (!result.success) {
                    throw new Error(result.error ?? 'Unknown ZIP download error.');
                }
            },
        },
        toast(message) {
            console.info('[platform-content]', message);
        },
    };
}
