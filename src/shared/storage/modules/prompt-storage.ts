import { DEFAULT_PROMPTS } from '../schema';
import type { StorageClient } from '../../browser/storage-client';
import { STORAGE_FIELDS } from '../storage-keys';
import type { PromptTemplate } from '../../../entities/prompt/model';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeText(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

export function clonePrompts(value: readonly PromptTemplate[]): PromptTemplate[] {
    return value.map((prompt) => ({ ...prompt }));
}

export function normalizePrompts(value: unknown): PromptTemplate[] {
    if (!Array.isArray(value)) {
        return clonePrompts(DEFAULT_PROMPTS);
    }

    return value
        .filter((prompt): prompt is Record<string, unknown> => isObject(prompt))
        .map((prompt) => ({
            id: normalizeText(prompt.id),
            title: normalizeText(prompt.title),
            content: normalizeText(prompt.content),
        }))
        .filter((prompt) => prompt.id.length > 0 && prompt.title.length > 0);
}

export interface PromptStorageModule {
    getPrompts(): Promise<PromptTemplate[]>;
    setPrompts(prompts: PromptTemplate[]): Promise<PromptTemplate[]>;
}

export function createPromptStorage(client: StorageClient): PromptStorageModule {
    return {
        async getPrompts() {
            const response = await client.get(STORAGE_FIELDS.prompts);
            return clonePrompts(normalizePrompts(response[STORAGE_FIELDS.prompts]));
        },
        async setPrompts(prompts) {
            const next = normalizePrompts(prompts);
            await client.set({ [STORAGE_FIELDS.prompts]: next });
            return clonePrompts(next);
        },
    };
}
