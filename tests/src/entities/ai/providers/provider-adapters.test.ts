import { describe, expect, it } from 'vitest';

import { AI_PROMPT_VARIABLES } from '../../../../../src/entities/ai/prompt';
import { AiProviderError, type FetchLike } from '../../../../../src/entities/ai/provider-adapter';
import { createClaudeAdapter } from '../../../../../src/entities/ai/providers/claude';
import { createGeminiAdapter } from '../../../../../src/entities/ai/providers/gemini';
import { createOpenAiAdapter } from '../../../../../src/entities/ai/providers/openai';
import { readJsonFixture } from '../../../../support/fixtures';

interface FetchCall {
    readonly input: RequestInfo | URL;
    readonly init: RequestInit | undefined;
}

function createJsonResponse(payload: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');

    return new Response(JSON.stringify(payload), {
        status: init.status ?? 200,
        statusText: init.statusText,
        headers,
    });
}

function createRecordingFetch(response: Response): {
    readonly calls: FetchCall[];
    readonly fetchImpl: FetchLike;
} {
    const calls: FetchCall[] = [];
    const fetchImpl: FetchLike = async (input, init) => {
        calls.push({ input, init });
        return response;
    };

    return { calls, fetchImpl };
}

const request = {
    apiKey: 'secret-key',
    model: 'model-name',
    prompt: {
        system: 'trusted system',
        user: 'untrusted user',
        variables: Object.fromEntries(
            AI_PROMPT_VARIABLES.map((variable) => [variable, ''])
        ) as Record<(typeof AI_PROMPT_VARIABLES)[number], string>,
    },
    temperature: 0.4,
    maxOutputTokens: 900,
};

describe('AI provider adapters', () => {
    it('builds OpenAI Responses payloads with bearer authorization', async () => {
        const { calls, fetchImpl } = createRecordingFetch(
            createJsonResponse(readJsonFixture('ai', 'openai-success.json'))
        );

        const result = await createOpenAiAdapter(fetchImpl).generate(request);

        expect(result.output).toBe('عرض مقترح جاهز للمراجعة.');
        expect(String(calls[0]?.input)).toBe('https://api.openai.com/v1/responses');
        expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer secret-key');
        expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
            model: 'model-name',
            instructions: 'trusted system',
            input: 'untrusted user',
            max_output_tokens: 900,
            temperature: 0.4,
        });
    });

    it('sends Gemini API keys in headers, never query strings', async () => {
        const { calls, fetchImpl } = createRecordingFetch(
            createJsonResponse(readJsonFixture('ai', 'gemini-success.json'))
        );

        const result = await createGeminiAdapter(fetchImpl).generate(request);
        const url = new URL(String(calls[0]?.input));

        expect(result.output).toBe('اقتراح Gemini جاهز.');
        expect(url.search).toBe('');
        expect(url.href).not.toContain('secret-key');
        expect(new Headers(calls[0]?.init?.headers).get('x-goog-api-key')).toBe('secret-key');
    });

    it('builds Claude Messages payloads with direct-browser access headers', async () => {
        const { calls, fetchImpl } = createRecordingFetch(
            createJsonResponse(readJsonFixture('ai', 'claude-success.json'))
        );

        const result = await createClaudeAdapter(fetchImpl).generate(request);

        expect(result.output).toBe('اقتراح Claude جاهز.');
        expect(new Headers(calls[0]?.init?.headers).get('x-api-key')).toBe('secret-key');
        expect(new Headers(calls[0]?.init?.headers).get('anthropic-version')).toBe('2023-06-01');
        expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
            model: 'model-name',
            system: 'trusted system',
            temperature: 0.4,
            max_tokens: 900,
        });
    });

    it.each([
        ['authentication', 401, 'authentication'],
        ['rate limit', 429, 'rate_limit'],
        ['server', 503, 'server'],
        ['provider', 400, 'provider'],
    ] as const)('classifies %s provider errors', async (_label, status, category) => {
        const { fetchImpl } = createRecordingFetch(
            createJsonResponse(
                { error: { message: 'provider rejected request', code: 'bad_request' } },
                { status }
            )
        );

        await expect(createOpenAiAdapter(fetchImpl).generate(request)).rejects.toMatchObject({
            name: 'AiProviderError',
            provider: 'openai',
            category,
            status,
            code: 'bad_request',
        } satisfies Partial<AiProviderError>);
    });

    it('classifies Gemini safety blocks separately from generic provider errors', async () => {
        const { fetchImpl } = createRecordingFetch(
            createJsonResponse({
                candidates: [
                    {
                        finishReason: 'SAFETY',
                        content: { parts: [] },
                    },
                ],
            })
        );

        await expect(createGeminiAdapter(fetchImpl).generate(request)).rejects.toMatchObject({
            provider: 'gemini',
            category: 'safety',
            code: 'SAFETY',
        } satisfies Partial<AiProviderError>);
    });
});
