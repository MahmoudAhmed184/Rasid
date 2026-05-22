import { describe, expect, it, vi } from 'vitest';

import { AiProviderError, type FetchLike } from '../../../../../src/entities/ai/provider-adapter';
import {
    ensureOutput,
    extractClaudeOutput,
    extractGeminiOutput,
    extractOpenAiOutput,
    fetchWithTimeout,
    parseJsonResponse,
    withoutUndefined,
} from '../../../../../src/entities/ai/providers/shared';

function createResponse(body: string, init: ResponseInit = {}): Response {
    return new Response(body, {
        status: init.status ?? 200,
        statusText: init.statusText,
        headers: init.headers,
    });
}

describe('AI provider shared helpers', () => {
    it('drops only undefined fields from provider payload objects', () => {
        expect(
            withoutUndefined({
                model: 'gpt-test',
                instructions: undefined,
                temperature: 0,
                metadata: null,
                enabled: false,
            })
        ).toEqual({
            model: 'gpt-test',
            temperature: 0,
            metadata: null,
            enabled: false,
        });
    });

    it('parses successful JSON, text, and empty provider responses', async () => {
        await expect(parseJsonResponse('openai', createResponse('{"ok":true}'))).resolves.toEqual({
            ok: true,
        });
        await expect(parseJsonResponse('openai', createResponse('plain text'))).resolves.toBe(
            'plain text'
        );
        await expect(parseJsonResponse('openai', createResponse(''))).resolves.toBeNull();
    });

    it('extracts provider error message, code, retry, and request identifiers defensively', async () => {
        await expect(
            parseJsonResponse(
                'claude',
                createResponse('{"details":{"message":"quota exceeded"},"error":{"type":"rate"}}', {
                    status: 429,
                    headers: {
                        'retry-after': '60',
                        'anthropic-request-id': 'req_claude',
                    },
                })
            )
        ).rejects.toMatchObject({
            name: 'AiProviderError',
            provider: 'claude',
            category: 'rate_limit',
            status: 429,
            code: 'rate',
            retryAfter: '60',
            requestId: 'req_claude',
            message: 'quota exceeded',
        } satisfies Partial<AiProviderError>);

        await expect(
            parseJsonResponse(
                'gemini',
                createResponse('blocked', {
                    status: 403,
                    statusText: 'Forbidden',
                    headers: { 'x-goog-request-id': 'req_google' },
                })
            )
        ).rejects.toMatchObject({
            provider: 'gemini',
            category: 'authentication',
            requestId: 'req_google',
            message: 'blocked',
        } satisfies Partial<AiProviderError>);

        await expect(
            parseJsonResponse(
                'openai',
                createResponse('{"code":"server_busy","message":"try later"}', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'openai-request-id': 'req_openai' },
                })
            )
        ).rejects.toMatchObject({
            provider: 'openai',
            category: 'server',
            status: 503,
            code: 'server_busy',
            requestId: 'req_openai',
            message: 'try later',
        } satisfies Partial<AiProviderError>);

        await expect(
            parseJsonResponse(
                'openai',
                createResponse('{"error":{"status":"invalid_request_error"}}', {
                    status: 400,
                    statusText: 'Bad Request',
                    headers: { 'x-request-id': 'req_generic' },
                })
            )
        ).rejects.toMatchObject({
            provider: 'openai',
            category: 'provider',
            code: 'invalid_request_error',
            requestId: 'req_generic',
            message: 'Bad Request',
        } satisfies Partial<AiProviderError>);
    });

    it('classifies fetch failures and aborts without exposing transport internals', async () => {
        const successfulFetch = vi.fn(async (_input, init) => {
            expect(init?.signal).toBeInstanceOf(AbortSignal);
            return createResponse('{"ok":true}');
        }) satisfies FetchLike;

        await expect(
            fetchWithTimeout('openai', successfulFetch, 'https://api.example.test/', {
                method: 'POST',
            })
        ).resolves.toBeInstanceOf(Response);
        expect(successfulFetch).toHaveBeenCalledWith(
            'https://api.example.test/',
            expect.objectContaining({
                method: 'POST',
                signal: expect.any(AbortSignal),
            })
        );

        const networkFetch: FetchLike = async () => {
            throw new TypeError('offline');
        };

        await expect(
            fetchWithTimeout('openai', networkFetch, 'https://api.example.test/', {})
        ).rejects.toMatchObject({
            provider: 'openai',
            category: 'network',
            message: 'The provider request failed before a response was received.',
        } satisfies Partial<AiProviderError>);

        vi.useFakeTimers();
        const abortingFetch: FetchLike = async (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    reject(new DOMException('aborted', 'AbortError'));
                });
            });
        const request = fetchWithTimeout(
            'gemini',
            abortingFetch,
            'https://api.example.test/',
            {},
            5
        );
        const requestExpectation = expect(request).rejects.toMatchObject({
            provider: 'gemini',
            category: 'timeout',
            message: 'The provider request timed out.',
        } satisfies Partial<AiProviderError>);

        await vi.advanceTimersByTimeAsync(5);
        await requestExpectation;
    });

    it('extracts text from OpenAI, Gemini, and Claude response shapes', () => {
        expect(extractOpenAiOutput({ output_text: '  Direct text  ' })).toBe('Direct text');
        expect(
            extractOpenAiOutput({
                output: [
                    { content: [{ text: 'First' }, { text: 'First' }] },
                    { output_text: 'Second' },
                ],
            })
        ).toBe('First\nSecond');
        expect(
            extractOpenAiOutput({
                choices: [{ content: [{ text: 'Choice text' }] }],
            })
        ).toBe('Choice text');
        expect(
            extractGeminiOutput({
                candidates: [
                    {
                        finishReason: 'STOP',
                        content: { parts: [{ text: 'Gemini text' }] },
                    },
                ],
            })
        ).toBe('Gemini text');
        expect(extractClaudeOutput({ content: [{ text: 'Claude text' }] })).toBe('Claude text');
        expect(extractOpenAiOutput(null)).toBe('');
        expect(extractGeminiOutput({ candidates: [{ finishReason: 'STOP' }, null] })).toBe('');
        expect(extractClaudeOutput(null)).toBe('');
    });

    it('raises explicit empty-output and Gemini safety errors', () => {
        expect(ensureOutput('claude', '\n Final proposal \n')).toBe('Final proposal');
        expect(() => ensureOutput('openai', '   ')).toThrow(AiProviderError);
        expect(() =>
            extractGeminiOutput({
                promptFeedback: {
                    blockReason: 'PROHIBITED_CONTENT',
                },
            })
        ).toThrow(AiProviderError);
        expect(() =>
            extractGeminiOutput({
                candidates: [
                    {
                        finishReason: 'SPII',
                        content: { parts: [{ text: 'blocked' }] },
                    },
                ],
            })
        ).toThrow(AiProviderError);
    });
});
