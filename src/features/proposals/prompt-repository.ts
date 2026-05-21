import type { PromptTemplate } from '../../entities/prompt/model';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';

export interface PromptDraft {
    readonly id?: string;
    readonly title: string;
    readonly content: string;
}

export interface PromptRepository {
    list(): Promise<PromptTemplate[]>;
    getById(id: string): Promise<PromptTemplate | null>;
    save(draft: PromptDraft): Promise<PromptTemplate>;
    remove(id: string): Promise<PromptTemplate[]>;
}

function clonePrompt(prompt: PromptTemplate): PromptTemplate {
    return { ...prompt };
}

export function createPromptRepository(storage: ExtensionStorage): PromptRepository {
    return {
        async list() {
            return storage.getPrompts();
        },
        async getById(id) {
            const prompts = await storage.getPrompts();
            const prompt = prompts.find((entry) => entry.id === id);
            return prompt ? clonePrompt(prompt) : null;
        },
        async save(draft) {
            const prompts = await storage.getPrompts();
            const nextPrompt = {
                id: draft.id ?? crypto.randomUUID(),
                title: draft.title.trim(),
                content: draft.content.trim(),
            } satisfies PromptTemplate;

            const nextPrompts =
                typeof draft.id === 'string' && prompts.some((prompt) => prompt.id === draft.id)
                    ? prompts.map((prompt) =>
                          prompt.id === draft.id ? clonePrompt(nextPrompt) : clonePrompt(prompt)
                      )
                    : [...prompts.map(clonePrompt), nextPrompt];

            await storage.setPrompts(nextPrompts);
            return clonePrompt(nextPrompt);
        },
        async remove(id) {
            const prompts = await storage.getPrompts();
            const nextPrompts = prompts.filter((prompt) => prompt.id !== id);
            return storage.setPrompts(nextPrompts);
        },
    };
}
