import type { AiProviderAdapter } from '../provider-adapter';
import { getDefaultFetch, type FetchLike } from '../provider-adapter';
import {
    ensureOutput,
    extractGeminiOutput,
    fetchWithTimeout,
    parseJsonResponse,
    withoutUndefined,
} from './shared';

export function createGeminiAdapter(fetchImpl: FetchLike = getDefaultFetch()): AiProviderAdapter {
    return {
        id: 'gemini',
        async generate(request) {
            const response = await fetchWithTimeout(
                'gemini',
                fetchImpl,
                `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
                    request.model
                )}:generateContent`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-goog-api-key': request.apiKey,
                    },
                    body: JSON.stringify(
                        withoutUndefined({
                            systemInstruction: request.prompt.system
                                ? {
                                      parts: [{ text: request.prompt.system }],
                                  }
                                : undefined,
                            contents: [
                                {
                                    role: 'user',
                                    parts: [{ text: request.prompt.user }],
                                },
                            ],
                            generationConfig: withoutUndefined({
                                temperature: request.temperature,
                                maxOutputTokens: request.maxOutputTokens,
                            }),
                        })
                    ),
                }
            );

            const payload = await parseJsonResponse('gemini', response);

            return {
                output: ensureOutput('gemini', extractGeminiOutput(payload)),
                raw: payload,
            };
        },
    };
}
