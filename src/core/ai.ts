import {
    AI_PROMPT_VARIABLES,
    type AiGenerateInput,
    type AiGenerateResult,
    type AiPromptVariable,
    type AiProviderId,
    type AiProviderRequest,
    type AiProviderResponse,
    type AiRequestContext,
    type NormalizedAiPrompt,
    type PromptTemplateRecord,
} from '../models/ai'

type FetchLike = typeof fetch

export interface AiProviderAdapter {
    id: AiProviderId
    generate(request: AiProviderRequest): Promise<AiProviderResponse>
}

export interface PromptTemplateRegistry {
    list(): PromptTemplateRecord[]
    get(id: string): PromptTemplateRecord | undefined
    upsert(template: PromptTemplateRecord): void
    remove(id: string): boolean
    render(id: string, context: AiRequestContext): NormalizedAiPrompt
}

export interface AiGateway {
    generate(input: AiGenerateInput): Promise<AiGenerateResult>
    listTemplates(): PromptTemplateRecord[]
    getTemplate(id: string): PromptTemplateRecord | undefined
    renderTemplate(templateId: string, context: AiRequestContext): NormalizedAiPrompt
    registerTemplate(template: PromptTemplateRecord): void
    upsertTemplate(template: PromptTemplateRecord): void
    removeTemplate(id: string): boolean
    listVariables(): readonly AiPromptVariable[]
}

export interface CreateAiGatewayOptions {
    adapters?: AiProviderAdapter[]
    initialTemplates?: PromptTemplateRecord[]
    fetchImpl?: FetchLike
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function getDefaultFetch(): FetchLike {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable in the current runtime.')
    }

    return fetch.bind(globalThis)
}

function cleanText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function joinTags(tags: AiRequestContext['tags']): string {
    if (Array.isArray(tags)) {
        return tags.map((tag) => String(tag).trim()).filter(Boolean).join(', ')
    }

    return typeof tags === 'string' ? tags.trim() : ''
}

function interpolate(template: string, values: Record<string, string>): string {
    return template.replace(/\{([a-z0-9_]+)\}/gi, (_, key: string) => values[key] ?? '')
}

function normalizeTemplate(template: PromptTemplateRecord): PromptTemplateRecord {
    const normalized = {
        id: cleanText(template.id),
        name: cleanText(template.name),
        description: cleanText(template.description) || undefined,
        system: cleanText(template.system) || undefined,
        user: cleanText(template.user),
    }

    if (!normalized.id) {
        throw new Error('Prompt templates must include a stable id.')
    }

    if (!normalized.name) {
        throw new Error(`Prompt template "${normalized.id}" must include a display name.`)
    }

    if (!normalized.user) {
        throw new Error(`Prompt template "${normalized.id}" must include a user prompt.`)
    }

    return normalized
}

export function buildPromptVariables(
    context: AiRequestContext
): Record<AiPromptVariable, string> {
    return {
        title: cleanText(context.title),
        description: cleanText(context.description),
        url: cleanText(context.url),
        tags: joinTags(context.tags),
        client_name: cleanText(context.clientName),
        client_type: cleanText(context.clientType),
        budget: cleanText(context.budget),
        duration: cleanText(context.duration),
        publish_date: cleanText(context.publishDate),
        project_id: cleanText(context.projectId),
        project_status: cleanText(context.projectStatus),
        category: cleanText(context.category),
        hiring_rate: cleanText(context.hiringRate),
        open_projects: cleanText(context.openProjects),
        underway_projects: cleanText(context.underwayProjects),
        client_joined: cleanText(context.clientJoined),
        communications: cleanText(context.communications),
    }
}

export function renderLegacyPromptTemplate(
    template: string,
    context: AiRequestContext
): string {
    return interpolate(template, buildPromptVariables(context))
}

export function renderPromptTemplate(
    template: PromptTemplateRecord,
    context: AiRequestContext
): NormalizedAiPrompt {
    const variables = buildPromptVariables(context)
    const system = interpolate(template.system ?? '', variables).trim()
    const user = interpolate(template.user, variables).trim()

    return {
        system,
        user,
        combined: [system, user].filter(Boolean).join('\n\n'),
        variables,
    }
}

export function createPromptTemplateRegistry(
    initialTemplates: PromptTemplateRecord[] = []
): PromptTemplateRegistry {
    const templateMap = new Map<string, PromptTemplateRecord>()

    for (const template of initialTemplates) {
        const normalized = normalizeTemplate(template)
        templateMap.set(normalized.id, normalized)
    }

    return {
        list() {
            return [...templateMap.values()]
        },
        get(id) {
            return templateMap.get(id)
        },
        upsert(template) {
            const normalized = normalizeTemplate(template)
            templateMap.set(normalized.id, normalized)
        },
        remove(id) {
            return templateMap.delete(id)
        },
        render(id, context) {
            const template = templateMap.get(id)

            if (!template) {
                throw new Error(`Unknown prompt template: ${id}`)
            }

            return renderPromptTemplate(template, context)
        },
    }
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
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

async function parseJsonResponse(
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

function extractOpenAiOutput(payload: unknown): string {
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

function extractGeminiOutput(payload: unknown): string {
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

function extractClaudeOutput(payload: unknown): string {
    if (!isObject(payload)) {
        return ''
    }

    return collectTextParts(payload.content).join('\n').trim()
}

function ensureOutput(provider: AiProviderId, output: string): string {
    const normalized = output.trim()

    if (!normalized) {
        throw new Error(`${provider} response did not contain text output.`)
    }

    return normalized
}

export function createOpenAiAdapter(fetchImpl: FetchLike = getDefaultFetch()): AiProviderAdapter {
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

export function createGeminiAdapter(fetchImpl: FetchLike = getDefaultFetch()): AiProviderAdapter {
    return {
        id: 'gemini',
        async generate(request) {
            const response = await fetchImpl(
                `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
                    request.model
                )}:generateContent?key=${encodeURIComponent(request.apiKey)}`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
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
            )

            const payload = await parseJsonResponse('gemini', response)

            return {
                output: ensureOutput('gemini', extractGeminiOutput(payload)),
                raw: payload,
            }
        },
    }
}

export function createClaudeAdapter(fetchImpl: FetchLike = getDefaultFetch()): AiProviderAdapter {
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

export function createDefaultAiProviderAdapters(
    fetchImpl: FetchLike = getDefaultFetch()
): AiProviderAdapter[] {
    return [
        createOpenAiAdapter(fetchImpl),
        createGeminiAdapter(fetchImpl),
        createClaudeAdapter(fetchImpl),
    ]
}

function normalizeGatewayOptions(
    adaptersOrOptions: AiProviderAdapter[] | CreateAiGatewayOptions,
    initialTemplates: PromptTemplateRecord[]
): Required<Pick<CreateAiGatewayOptions, 'adapters' | 'initialTemplates'>> &
    Pick<CreateAiGatewayOptions, 'fetchImpl'> {
    if (Array.isArray(adaptersOrOptions)) {
        return {
            adapters: adaptersOrOptions,
            initialTemplates,
        }
    }

    return {
        adapters: adaptersOrOptions.adapters ?? [],
        initialTemplates: adaptersOrOptions.initialTemplates ?? [],
        fetchImpl: adaptersOrOptions.fetchImpl,
    }
}

export function createAiGateway(
    adaptersOrOptions: AiProviderAdapter[] | CreateAiGatewayOptions = [],
    initialTemplates: PromptTemplateRecord[] = []
): AiGateway {
    const options = normalizeGatewayOptions(adaptersOrOptions, initialTemplates)
    const registry = createPromptTemplateRegistry(options.initialTemplates)
    const adapters =
        options.adapters.length > 0
            ? options.adapters
            : createDefaultAiProviderAdapters(options.fetchImpl ?? getDefaultFetch())
    const adapterMap = new Map(adapters.map((adapter) => [adapter.id, adapter]))

    return {
        async generate(input) {
            const adapter = adapterMap.get(input.provider)

            if (!adapter) {
                throw new Error(`Unsupported AI provider: ${input.provider}`)
            }

            const prompt = registry.render(input.templateId, input.context)
            const result = await adapter.generate({
                apiKey: input.apiKey,
                model: input.model,
                prompt,
                temperature: input.temperature,
                maxOutputTokens: input.maxOutputTokens,
                metadata: input.metadata,
            })

            return {
                provider: input.provider,
                model: input.model,
                output: result.output,
                prompt,
                raw: result.raw,
            }
        },
        listTemplates() {
            return registry.list()
        },
        getTemplate(id) {
            return registry.get(id)
        },
        renderTemplate(templateId, context) {
            return registry.render(templateId, context)
        },
        registerTemplate(template) {
            registry.upsert(template)
        },
        upsertTemplate(template) {
            registry.upsert(template)
        },
        removeTemplate(id) {
            return registry.remove(id)
        },
        listVariables() {
            return AI_PROMPT_VARIABLES
        },
    }
}
