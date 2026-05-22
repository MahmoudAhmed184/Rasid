import type { AiRequestContext } from '../../entities/ai/model';
import { normalizeAiChatUrl } from '../../entities/ai/chat-url';
import type { ExtensionSettings } from '../../entities/settings/model';
import type { GenerateProposalResponse } from './proposal-contract';
import type { ResolvedProposalTemplate } from './proposal-template-catalog';
import { renderPromptTemplate } from './prompt-template-registry';

export function generateBridgeProposal(input: {
    readonly settings: Pick<ExtensionSettings, 'aiChatUrl'>;
    readonly template: ResolvedProposalTemplate;
    readonly context: AiRequestContext;
}): GenerateProposalResponse {
    const prompt = renderPromptTemplate(input.template.aiTemplate, input.context);

    return {
        success: true,
        mode: 'bridge',
        prompt: [
            'تعليمات موثوقة يجب اتباعها قبل كتابة العرض:',
            prompt.system,
            '',
            'مهمة المستخدم وبيانات المشروع:',
            prompt.user,
        ]
            .filter(Boolean)
            .join('\n'),
        chatUrl: normalizeAiChatUrl(input.settings.aiChatUrl),
    };
}
