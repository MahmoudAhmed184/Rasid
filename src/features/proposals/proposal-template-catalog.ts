import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import { DEFAULT_PROMPTS } from '../../shared/storage/schema';
import type { PromptTemplate } from '../../entities/prompt/model';
import type { PromptTemplateRecord } from './prompt-types';

export interface ResolvedProposalTemplate {
    readonly id: string;
    readonly legacyPrompt: string;
    readonly aiTemplate: PromptTemplateRecord;
}

export interface ProposalTemplateCatalog {
    resolve(
        templateId: string,
        sharedSystemPrompt: string
    ): Promise<ResolvedProposalTemplate | null>;
}

function resolvePromptTemplate(
    templates: readonly PromptTemplate[],
    templateId: string
): PromptTemplate | null {
    return (
        templates.find((template) => template.id === templateId) ??
        templates.find((template) => template.id === 'default_proposal') ??
        null
    );
}

function toPromptTemplateRecord(
    template: PromptTemplate,
    sharedSystemPrompt: string
): PromptTemplateRecord {
    return {
        id: template.id,
        name: template.title,
        system: sharedSystemPrompt || undefined,
        user: template.content,
    };
}

export function createProposalTemplateCatalog(
    storage: Pick<ExtensionStorage, 'getPrompts'>
): ProposalTemplateCatalog {
    return {
        async resolve(templateId, sharedSystemPrompt) {
            const storedPrompts = await storage.getPrompts();
            const templates = storedPrompts.length > 0 ? storedPrompts : DEFAULT_PROMPTS;
            const selectedTemplate = resolvePromptTemplate(templates, templateId);

            if (!selectedTemplate) {
                return null;
            }

            return {
                id: selectedTemplate.id,
                legacyPrompt: selectedTemplate.content,
                aiTemplate: toPromptTemplateRecord(selectedTemplate, sharedSystemPrompt),
            };
        },
    };
}
