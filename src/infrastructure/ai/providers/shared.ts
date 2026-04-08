import type { AiProviderId } from '../../../models/ai'

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

export function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => typeof entry !== 'undefined')
    ) as T
}

async function parseResponsePayload(response: Response): Promise<unknown> {
    const text = await response.text()

    if (!text) {
        return null
    }

    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

function extractErrorMessage(payload: unknown): string | null {
    if (typeof payload === 'string') {
        return payload
    }

    if (!isObject(payload)) {
        return null
    }

    if (typeof payload.message === 'string') {
        return payload.message
    }

    if (typeof payload.error === 'string') {
        return payload.error
    }

    if (isObject(payload.error) && typeof payload.error.message === 'string') {
        return payload.error.message
    }

    if (isObject(payload.details) && typeof payload.details.message === 'string') {
        return payload.details.message
    }

    return null
}

export async function parseJsonResponse(
    provider: AiProviderId,
    response: Response
): Promise<unknown> {
    const payload = await parseResponsePayload(response)

    if (!response.ok) {
        throw new Error(
            `${provider} request failed (${response.status}): ${extractErrorMessage(payload) ?? response.statusText}`
        )
    }

    return payload
}

function collectTextParts(value: unknown): string[] {
    if (typeof value === 'string') {
        return value.trim() ? [value.trim()] : []
    }

    if (Array.isArray(value)) {
        return value.flatMap((entry) => collectTextParts(entry))
    }

    if (!isObject(value)) {
        return []
    }

    const directKeys = ['text', 'output_text', 'content']
    const nestedKeys = ['content', 'parts', 'output', 'messages']
    const segments: string[] = []

    for (const key of directKeys) {
        const candidate = value[key]
        if (typeof candidate === 'string' && candidate.trim()) {
            segments.push(candidate.trim())
        }
    }

    for (const key of nestedKeys) {
        const candidate = value[key]
        if (Array.isArray(candidate)) {
            segments.push(...collectTextParts(candidate))
        }
    }

    return [...new Set(segments)]
}

export function extractOpenAiOutput(payload: unknown): string {
    if (!isObject(payload)) {
        return ''
    }

    if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
        return payload.output_text.trim()
    }

    const output = collectTextParts(payload.output)
    if (output.length > 0) {
        return output.join('\n').trim()
    }

    const choices = Array.isArray(payload.choices) ? collectTextParts(payload.choices) : []
    return choices.join('\n').trim()
}

export function extractGeminiOutput(payload: unknown): string {
    if (!isObject(payload) || !Array.isArray(payload.candidates)) {
        return ''
    }

    return payload.candidates
        .flatMap((candidate) =>
            isObject(candidate) && isObject(candidate.content)
                ? collectTextParts(candidate.content.parts)
                : []
        )
        .join('\n')
        .trim()
}

export function extractClaudeOutput(payload: unknown): string {
    if (!isObject(payload)) {
        return ''
    }

    return collectTextParts(payload.content).join('\n').trim()
}

export function ensureOutput(provider: AiProviderId, output: string): string {
    const normalized = output.trim()

    if (!normalized) {
        throw new Error(`${provider} response did not contain text output.`)
    }

    return normalized
}
