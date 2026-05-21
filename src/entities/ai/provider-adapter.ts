import type { NormalizedAiPrompt } from '../../features/proposals/prompt-types';
import type { AiProviderId } from './model';

export type FetchLike = typeof fetch;

export interface AiProviderRequest {
    apiKey: string;
    model: string;
    prompt: NormalizedAiPrompt;
    temperature?: number;
    maxOutputTokens?: number;
    metadata?: Record<string, string>;
}

export interface AiProviderResponse {
    output: string;
    raw?: unknown;
}

export interface AiProviderAdapter {
    id: AiProviderId;
    generate(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export function getDefaultFetch(): FetchLike {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable in the current runtime.');
    }

    return fetch.bind(globalThis);
}
