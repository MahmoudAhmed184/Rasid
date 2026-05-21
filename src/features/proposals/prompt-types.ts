import type { AiPromptVariable } from './prompt-variables';

export interface PromptTemplateRecord {
    id: string;
    name: string;
    description?: string;
    system?: string;
    user: string;
}

export interface NormalizedAiPrompt {
    system: string;
    user: string;
    combined: string;
    variables: Record<AiPromptVariable, string>;
}
