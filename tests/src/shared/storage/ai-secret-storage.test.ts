import { describe, expect, it } from 'vitest';

import {
    createAiSecretStorage,
    normalizeAiApiKey,
} from '../../../../src/shared/storage/modules/ai-secret-storage';
import { createMemoryStorage } from '../../../support/fake-storage';

describe('AI secret storage', () => {
    it('normalizes API keys by trimming strings and rejecting non-string values', () => {
        expect(normalizeAiApiKey('  sk-test  ')).toBe('sk-test');
        expect(normalizeAiApiKey('   ')).toBe('');
        expect(normalizeAiApiKey(null)).toBe('');
        expect(normalizeAiApiKey({ key: 'sk-test' })).toBe('');
    });

    it('stores secrets in the supplied client and removes blank or cleared keys', async () => {
        const client = createMemoryStorage();
        const storage = createAiSecretStorage(client);

        await expect(storage.getAiApiKey()).resolves.toBe('');
        await expect(storage.setAiApiKey('  sk-next  ')).resolves.toBe('sk-next');
        await expect(storage.getAiApiKey()).resolves.toBe('sk-next');
        expect(client.snapshot()).toEqual({ aiApiKeySecret: 'sk-next' });

        await expect(storage.setAiApiKey('   ')).resolves.toBe('');
        expect(client.snapshot()).toEqual({});

        await storage.setAiApiKey('sk-clear');
        await storage.clearAiApiKey();
        await expect(storage.getAiApiKey()).resolves.toBe('');
        expect(client.snapshot()).toEqual({});
    });
});
