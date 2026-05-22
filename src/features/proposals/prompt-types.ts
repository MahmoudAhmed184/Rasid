export type { NormalizedAiPrompt } from '../../entities/ai/prompt';

export interface PromptTemplateRecord {
    id: string;
    name: string;
    description?: string;
    system?: string;
    user: string;
}
