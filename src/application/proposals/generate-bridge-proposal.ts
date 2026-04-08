import type { AiRequestContext } from '../../models/ai';
import type { ExtensionSettings } from '../../models/settings';
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
