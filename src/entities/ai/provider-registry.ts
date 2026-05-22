import type { AiProviderId } from './model';
import { createClaudeAdapter } from './providers/claude';
import { createGeminiAdapter } from './providers/gemini';
import { createOpenAiAdapter } from './providers/openai';
import type { AiProviderAdapter, FetchLike } from './provider-adapter';
import { getDefaultFetch } from './provider-adapter';

export function createAiProviderRegistry(
    fetchImpl: FetchLike = getDefaultFetch()
): Record<AiProviderId, AiProviderAdapter> {
    const openai = createOpenAiAdapter(fetchImpl);
    const gemini = createGeminiAdapter(fetchImpl);
    const claude = createClaudeAdapter(fetchImpl);

    return {
        openai,
        gemini,
        claude,
    } satisfies Record<AiProviderId, AiProviderAdapter>;
}
