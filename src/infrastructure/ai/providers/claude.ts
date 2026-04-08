import type { AiProviderAdapter } from '../provider-adapter'
import { getDefaultFetch, type FetchLike } from '../provider-adapter'
import {
    ensureOutput,
    extractClaudeOutput,
    parseJsonResponse,
} from './shared'

export function createClaudeAdapter(
    fetchImpl: FetchLike = getDefaultFetch()
): AiProviderAdapter {
    return {
        id: 'claude',
        async generate(request) {
            const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': request.apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({
                    model: request.model,
                    system: request.prompt.system || undefined,
                    messages: [{ role: 'user', content: request.prompt.user }],
                    temperature: request.temperature,
                    max_tokens: request.maxOutputTokens ?? 1024,
                }),
            })

            const payload = await parseJsonResponse('claude', response)

            return {
                output: ensureOutput('claude', extractClaudeOutput(payload)),
                raw: payload,
            }
        },
    }
}
