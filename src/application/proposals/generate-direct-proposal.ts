import type { AiProviderId, AiRequestContext } from '../../models/ai';
import type { AiProviderAdapter } from '../../infrastructure/ai/provider-adapter';
import { createAiProviderRegistry } from '../../infrastructure/ai/provider-registry';
import type { ExtensionSettings } from '../../models/settings';
import type { GenerateProposalResponse } from './proposal-contract';
import type { ResolvedProposalTemplate } from './proposal-template-catalog';
import { renderPromptTemplate } from './prompt-template-registry';

interface DirectProposalDependencies {
    readonly providers?: Record<AiProviderId, AiProviderAdapter>;
}

export async function generateDirectProposal(
    deps: DirectProposalDependencies,
    input: {
        readonly settings: Pick<ExtensionSettings, 'aiApiKey' | 'aiModel' | 'aiProvider'>;
        readonly template: ResolvedProposalTemplate;
        readonly context: AiRequestContext;
    }
): Promise<GenerateProposalResponse> {
    if (!input.settings.aiApiKey) {
        return {
            success: false,
            error: 'Direct AI mode requires an API key.',
        };
    }

    if (!input.settings.aiModel) {
        return {
            success: false,
            error: 'Direct AI mode requires a model name.',
        };
    }

    const providers = deps.providers ?? createAiProviderRegistry();
    const provider = providers[input.settings.aiProvider];

    if (!provider) {
        return {
            success: false,
            error: `Unsupported AI provider: ${input.settings.aiProvider}`,
        };
    }

    try {
        const result = await provider.generate({
            apiKey: input.settings.aiApiKey,
            model: input.settings.aiModel,
            prompt: renderPromptTemplate(input.template.aiTemplate, input.context),
        });

        return {
            success: true,
            mode: 'direct',
            proposal: result.output,
            provider: input.settings.aiProvider,
            model: input.settings.aiModel,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
