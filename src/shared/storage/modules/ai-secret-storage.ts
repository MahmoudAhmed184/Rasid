import type { StorageClient } from '../../browser/storage-client';

const AI_API_KEY_SECRET_STORAGE_KEY = 'aiApiKeySecret';

export interface AiSecretStorageModule {
    getAiApiKey(): Promise<string>;
    setAiApiKey(apiKey: string): Promise<string>;
    clearAiApiKey(): Promise<void>;
}

export function normalizeAiApiKey(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function createAiSecretStorage(client: StorageClient): AiSecretStorageModule {
    return {
        async getAiApiKey() {
            const response = await client.get(AI_API_KEY_SECRET_STORAGE_KEY);
            return normalizeAiApiKey(response[AI_API_KEY_SECRET_STORAGE_KEY]);
        },
        async setAiApiKey(apiKey) {
            const next = normalizeAiApiKey(apiKey);

            if (!next) {
                await client.remove(AI_API_KEY_SECRET_STORAGE_KEY);
                return '';
            }

            await client.set({
                [AI_API_KEY_SECRET_STORAGE_KEY]: next,
            });
            return next;
        },
        async clearAiApiKey() {
            await client.remove(AI_API_KEY_SECRET_STORAGE_KEY);
        },
    };
}
