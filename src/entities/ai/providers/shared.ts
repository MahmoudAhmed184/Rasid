import type { AiProviderId } from '../model';
import { AiProviderError, type FetchLike } from '../provider-adapter';

const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 45_000;
const GEMINI_SAFETY_FINISH_REASONS = new Set(['BLOCKLIST', 'PROHIBITED_CONTENT', 'SAFETY', 'SPII']);

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => typeof entry !== 'undefined')
    ) as T;
}

async function parseResponsePayload(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function extractErrorMessage(payload: unknown): string | null {
    if (typeof payload === 'string') {
        return payload;
    }

    if (!isObject(payload)) {
        return null;
    }

    if (typeof payload.message === 'string') {
        return payload.message;
    }

    if (typeof payload.error === 'string') {
        return payload.error;
    }

    if (isObject(payload.error) && typeof payload.error.message === 'string') {
        return payload.error.message;
    }

    if (isObject(payload.details) && typeof payload.details.message === 'string') {
        return payload.details.message;
    }

    return null;
}

function extractErrorCode(payload: unknown): string | undefined {
    if (!isObject(payload)) {
        return undefined;
    }

    if (typeof payload.code === 'string') {
        return payload.code;
    }

    if (isObject(payload.error)) {
        if (typeof payload.error.code === 'string') {
            return payload.error.code;
        }

        if (typeof payload.error.type === 'string') {
            return payload.error.type;
        }

        if (typeof payload.error.status === 'string') {
            return payload.error.status;
        }
    }

    return undefined;
}

function classifyStatus(status: number) {
    if (status === 401 || status === 403) {
        return 'authentication' as const;
    }

    if (status === 429) {
        return 'rate_limit' as const;
    }

    if (status >= 500) {
        return 'server' as const;
    }

    return 'provider' as const;
}

function getHeader(response: Response, names: readonly string[]): string | undefined {
    for (const name of names) {
        const value = response.headers.get(name);

        if (value) {
            return value;
        }
    }

    return undefined;
}

export async function fetchWithTimeout(
    provider: AiProviderId,
    fetchImpl: FetchLike,
    input: RequestInfo | URL,
    init: RequestInit,
    timeoutMs: number = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetchImpl(input, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        const errorName = error instanceof Error ? error.name : '';

        throw new AiProviderError({
            provider,
            category: errorName === 'AbortError' ? 'timeout' : 'network',
            message:
                errorName === 'AbortError'
                    ? 'The provider request timed out.'
                    : 'The provider request failed before a response was received.',
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function parseJsonResponse(
    provider: AiProviderId,
    response: Response
): Promise<unknown> {
    const payload = await parseResponsePayload(response);

    if (!response.ok) {
        throw new AiProviderError(
            withoutUndefined({
                provider,
                category: classifyStatus(response.status),
                status: response.status,
                code: extractErrorCode(payload),
                retryAfter: getHeader(response, ['retry-after']),
                requestId: getHeader(response, [
                    'request-id',
                    'x-request-id',
                    'openai-request-id',
                    'anthropic-request-id',
                    'x-goog-request-id',
                ]),
                message: extractErrorMessage(payload) ?? response.statusText,
            })
        );
    }

    return payload;
}

function collectTextParts(value: unknown): string[] {
    if (typeof value === 'string') {
        return value.trim() ? [value.trim()] : [];
    }

    if (Array.isArray(value)) {
        return value.flatMap((entry) => collectTextParts(entry));
    }

    if (!isObject(value)) {
        return [];
    }

    const directKeys = ['text', 'output_text', 'content'];
    const nestedKeys = ['content', 'parts', 'output', 'messages'];
    const segments: string[] = [];

    for (const key of directKeys) {
        const candidate = value[key];
        if (typeof candidate === 'string' && candidate.trim()) {
            segments.push(candidate.trim());
        }
    }

    for (const key of nestedKeys) {
        const candidate = value[key];
        if (Array.isArray(candidate)) {
            segments.push(...collectTextParts(candidate));
        }
    }

    return [...new Set(segments)];
}

export function extractOpenAiOutput(payload: unknown): string {
    if (!isObject(payload)) {
        return '';
    }

    if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
        return payload.output_text.trim();
    }

    const output = collectTextParts(payload.output);
    if (output.length > 0) {
        return output.join('\n').trim();
    }

    const choices = Array.isArray(payload.choices) ? collectTextParts(payload.choices) : [];
    return choices.join('\n').trim();
}

export function extractGeminiOutput(payload: unknown): string {
    if (!isObject(payload) || !Array.isArray(payload.candidates)) {
        const blockReason =
            isObject(payload) && isObject(payload.promptFeedback)
                ? payload.promptFeedback.blockReason
                : null;

        if (typeof blockReason === 'string' && blockReason) {
            throw new AiProviderError({
                provider: 'gemini',
                category: 'safety',
                code: blockReason,
                message: 'Gemini blocked the prompt before generation.',
            });
        }

        return '';
    }

    for (const candidate of payload.candidates) {
        if (!isObject(candidate) || typeof candidate.finishReason !== 'string') {
            continue;
        }

        if (GEMINI_SAFETY_FINISH_REASONS.has(candidate.finishReason)) {
            throw new AiProviderError({
                provider: 'gemini',
                category: 'safety',
                code: candidate.finishReason,
                message: 'Gemini blocked the generated candidate for safety reasons.',
            });
        }
    }

    return payload.candidates
        .flatMap((candidate) =>
            isObject(candidate) && isObject(candidate.content)
                ? collectTextParts(candidate.content.parts)
                : []
        )
        .join('\n')
        .trim();
}

export function extractClaudeOutput(payload: unknown): string {
    if (!isObject(payload)) {
        return '';
    }

    return collectTextParts(payload.content).join('\n').trim();
}

export function ensureOutput(provider: AiProviderId, output: string): string {
    const normalized = output.trim();

    if (!normalized) {
        throw new AiProviderError({
            provider,
            category: 'empty_output',
            message: 'The provider response did not contain text output.',
        });
    }

    return normalized;
}
