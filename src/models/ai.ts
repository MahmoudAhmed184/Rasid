export const AI_PROMPT_VARIABLES = [
    'title',
    'description',
    'url',
    'tags',
    'client_name',
    'client_type',
    'budget',
    'duration',
    'publish_date',
    'project_id',
    'project_status',
    'category',
    'hiring_rate',
    'open_projects',
    'underway_projects',
    'client_joined',
    'communications',
] as const

export type AiPromptVariable = (typeof AI_PROMPT_VARIABLES)[number]
export type AiProviderId = 'openai' | 'gemini' | 'claude'

export interface PromptTemplateRecord {
    id: string
    name: string
    description?: string
    system?: string
    user: string
}

export interface AiRequestContext {
    title: string
    description: string
    budget?: string
    duration?: string
    clientName?: string
    clientType?: string
    url?: string
    category?: string
    tags?: string[] | string
    publishDate?: string
    projectId?: string
    projectStatus?: string
    hiringRate?: string
    openProjects?: string
    underwayProjects?: string
    clientJoined?: string
    communications?: string
}

export interface NormalizedAiPrompt {
    system: string
    user: string
    combined: string
    variables: Record<AiPromptVariable, string>
}

export interface AiGenerateInput {
    provider: AiProviderId
    apiKey: string
    model: string
    templateId: string
    context: AiRequestContext
    temperature?: number
    maxOutputTokens?: number
    metadata?: Record<string, string>
}

export interface AiProviderRequest {
    apiKey: string
    model: string
    prompt: NormalizedAiPrompt
    temperature?: number
    maxOutputTokens?: number
    metadata?: Record<string, string>
}

export interface AiProviderResponse {
    output: string
    raw?: unknown
}

export interface AiGenerateResult {
    provider: AiProviderId
    model: string
    output: string
    prompt: NormalizedAiPrompt
    raw?: unknown
}
