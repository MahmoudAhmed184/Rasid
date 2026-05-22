import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    AiProviderError,
    formatAiProviderError,
    getDefaultFetch,
} from '../../../../src/entities/ai/provider-adapter';

describe('AI provider adapter utilities', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: originalFetch,
        });
    });

    it('returns a bound global fetch implementation when available', async () => {
        const fetchMock = vi.fn(async () => new Response('ok'));
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });

        const fetchLike = getDefaultFetch();
        const response = await fetchLike('https://example.test/');

        expect(await response.text()).toBe('ok');
        expect(fetchMock).toHaveBeenCalledWith('https://example.test/');
    });

    it('throws a clear error when global fetch is unavailable', () => {
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: undefined,
        });

        expect(() => getDefaultFetch()).toThrow('Global fetch is unavailable');
    });

    it('formats provider errors with optional transport details', () => {
        expect(
            formatAiProviderError(
                new AiProviderError({
                    provider: 'openai',
                    category: 'rate_limit',
                    message: 'Too many requests',
                    status: 429,
                    code: 'rate_limit_exceeded',
                    retryAfter: '30',
                    requestId: 'req_123',
                })
            )
        ).toBe(
            'openai rate_limit: Too many requests (HTTP 429, code rate_limit_exceeded, retry after 30, request req_123)'
        );

        expect(
            formatAiProviderError(
                new AiProviderError({
                    provider: 'gemini',
                    category: 'empty_output',
                    message: 'No candidate output',
                })
            )
        ).toBe('gemini empty_output: No candidate output');
    });

    it('formats non-provider errors and unknown thrown values defensively', () => {
        expect(formatAiProviderError(new Error('network failed'))).toBe('network failed');
        expect(formatAiProviderError('plain failure')).toBe('plain failure');
        expect(formatAiProviderError({ reason: 'bad' })).toBe('[object Object]');
    });
});
