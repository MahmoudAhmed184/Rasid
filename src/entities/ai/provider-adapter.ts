import type { NormalizedAiPrompt } from './prompt';
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

export type AiProviderErrorCategory =
    | 'authentication'
    | 'empty_output'
    | 'network'
    | 'provider'
    | 'rate_limit'
    | 'safety'
    | 'server'
    | 'timeout';

export interface AiProviderErrorOptions {
    readonly provider: AiProviderId;
    readonly category: AiProviderErrorCategory;
    readonly message: string;
    readonly status?: number;
    readonly code?: string;
    readonly requestId?: string;
    readonly retryAfter?: string;
}

export class AiProviderError extends Error {
    readonly provider: AiProviderId;
    readonly category: AiProviderErrorCategory;
    readonly status: number | undefined;
    readonly code: string | undefined;
    readonly requestId: string | undefined;
    readonly retryAfter: string | undefined;

    constructor(options: AiProviderErrorOptions) {
        super(options.message);
        this.name = 'AiProviderError';
        this.provider = options.provider;
        this.category = options.category;
        this.status = options.status;
        this.code = options.code;
        this.requestId = options.requestId;
        this.retryAfter = options.retryAfter;
    }
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

export function formatAiProviderError(error: unknown): string {
    if (!(error instanceof AiProviderError)) {
        return error instanceof Error ? error.message : String(error);
    }

    const details = [
        error.status ? `HTTP ${error.status}` : null,
        error.code ? `code ${error.code}` : null,
        error.retryAfter ? `retry after ${error.retryAfter}` : null,
        error.requestId ? `request ${error.requestId}` : null,
    ]
        .filter(Boolean)
        .join(', ');

    return details
        ? `${error.provider} ${error.category}: ${error.message} (${details})`
        : `${error.provider} ${error.category}: ${error.message}`;
}
