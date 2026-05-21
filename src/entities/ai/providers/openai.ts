import type { AiProviderAdapter } from '../provider-adapter'
import { getDefaultFetch, type FetchLike } from '../provider-adapter'
import {
    ensureOutput,
    extractOpenAiOutput,
    parseJsonResponse,
    withoutUndefined,
} from './shared'

export function createOpenAiAdapter(
    fetchImpl: FetchLike = getDefaultFetch()
): AiProviderAdapter {
    return {
        id: 'openai',
        async generate(request) {
            const response = await fetchImpl('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${request.apiKey}`,
                },
                body: JSON.stringify(
                    withoutUndefined({
                        model: request.model,
                        instructions: request.prompt.system || undefined,
                        input: request.prompt.user,
                        temperature: request.temperature,
                        max_output_tokens: request.maxOutputTokens,
                        metadata: request.metadata,
                    })
                ),
            })

            const payload = await parseJsonResponse('openai', response)

            return {
                output: ensureOutput('openai', extractOpenAiOutput(payload)),
                raw: payload,
            }
        },
    }
}
