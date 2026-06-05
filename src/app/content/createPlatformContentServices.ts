import type { GenerateProposalResponse } from '../../features/proposals/proposal-contract';
import {
    requestDownloadZip,
    requestGenerateProposal,
    requestOpenChatBridgePrompt,
    type OpenChatBridgePromptFailureReason,
} from '../background/background-messages';
import type { AiRequestContext } from '../../entities/ai/model';
import type { PromptRepository } from '../../features/proposals/prompt-repository';
import type { ProposalRepository } from '../../features/proposals/proposal-repository';
import type { TrackingRepository } from '../../features/monitoring/tracking-repository';
import type {
    PlatformAutofillDraft,
    PlatformContentServices,
    PlatformPromptDraft,
    ProposalGenerationResult,
} from '../../platforms/contracts';

interface PlatformContentServiceDependencies {
    readonly promptRepository: Pick<PromptRepository, 'list' | 'save'>;
    readonly proposalRepository: Pick<ProposalRepository, 'getQuickTemplate' | 'queueAutofill'>;
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

function getBridgeFailureMessage(reason: OpenChatBridgePromptFailureReason): string {
    switch (reason) {
        case 'permission-denied':
            return 'لم تُمنح صلاحية فتح ChatGPT. أعد المحاولة ووافق على الصلاحية عند الطلب.';
        case 'unsupported':
            return 'المتصفح لا يدعم فتح جسر ChatGPT من الإضافة الحالية.';
        case 'tab-open-failed':
            return 'تعذر فتح أو تفعيل تبويب ChatGPT.';
        case 'injection-failed':
            return 'تم فتح ChatGPT لكن تعذر تجهيز المطالبة تلقائياً.';
    }
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
            async openBridgePrompt(prompt: string, chatUrl?: string) {
                const result = await requestOpenChatBridgePrompt(prompt, chatUrl);

                if (!result.success) {
                    throw new Error(getBridgeFailureMessage(result.reason));
                }
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
