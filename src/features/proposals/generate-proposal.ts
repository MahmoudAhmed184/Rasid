import type { AiProviderId, AiRequestContext } from '../../entities/ai/model';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import type { AiProviderAdapter } from '../../entities/ai/provider-adapter';
import type { GenerateProposalResponse } from './proposal-contract';
import { generateBridgeProposal } from './generate-bridge-proposal';
import { generateDirectProposal } from './generate-direct-proposal';
import type { ProposalTemplateCatalog } from './proposal-template-catalog';

interface ProposalGeneratorDependencies {
    readonly settings: Pick<ExtensionStorage, 'getSettings'>;
    readonly templates: ProposalTemplateCatalog;
    readonly providers?: Record<AiProviderId, AiProviderAdapter>;
}

export interface ProposalGenerator {
    generate(templateId: string, context: AiRequestContext): Promise<GenerateProposalResponse>;
}

export async function generateProposal(
    deps: ProposalGeneratorDependencies,
    templateId: string,
    context: AiRequestContext
): Promise<GenerateProposalResponse> {
    const settings = await deps.settings.getSettings();
    const selectedTemplate = await deps.templates.resolve(templateId, settings.aiSystemPrompt);

    if (!selectedTemplate) {
        return {
            success: false,
            error: `Unknown prompt template: ${templateId}`,
        };
    }

    if (settings.aiExecutionMode !== 'direct') {
        return generateBridgeProposal({
            settings,
            template: selectedTemplate,
            context,
        });
    }

    return generateDirectProposal(
        {
            providers: deps.providers,
        },
        {
            settings,
            template: selectedTemplate,
            context,
        }
    );
}

export function createProposalGenerator(deps: ProposalGeneratorDependencies): ProposalGenerator {
    return {
        generate(templateId, context) {
            return generateProposal(deps, templateId, context);
        },
    };
}
