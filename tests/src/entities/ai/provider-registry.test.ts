import { describe, expect, it, vi } from 'vitest';

import { createAiProviderRegistry } from '../../../../src/entities/ai/provider-registry';
import type { FetchLike } from '../../../../src/entities/ai/provider-adapter';

describe('AI provider registry', () => {
    it('registers only the shipped direct providers using the supplied fetch implementation', () => {
        const fetchImpl: FetchLike = vi.fn(async () => new Response('{}'));
        const registry = createAiProviderRegistry(fetchImpl);

        expect(Object.keys(registry).sort()).toEqual(['claude', 'gemini', 'openai']);
        expect(registry.openai.id).toBe('openai');
        expect(registry.gemini.id).toBe('gemini');
        expect(registry.claude.id).toBe('claude');
    });
});
