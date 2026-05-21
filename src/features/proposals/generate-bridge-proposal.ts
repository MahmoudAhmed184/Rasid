import type { AiRequestContext } from '../../entities/ai/model';
import type { ExtensionSettings } from '../../entities/settings/model';
import type { GenerateProposalResponse } from './proposal-contract';
import type { ResolvedProposalTemplate } from './proposal-template-catalog';
import { renderLegacyPromptTemplate } from './prompt-template-registry';

export function generateBridgeProposal(input: {
    readonly settings: Pick<ExtensionSettings, 'aiChatUrl'>;
    readonly template: ResolvedProposalTemplate;
    readonly context: AiRequestContext;
}): GenerateProposalResponse {
    return {
        success: true,
        mode: 'bridge',
        prompt: renderLegacyPromptTemplate(input.template.legacyPrompt, input.context),
        chatUrl: input.settings.aiChatUrl || 'https://chatgpt.com/',
    };
}
