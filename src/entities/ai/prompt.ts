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
    'attachments',
] as const;

export type AiPromptVariable = (typeof AI_PROMPT_VARIABLES)[number];

export interface NormalizedAiPrompt {
    system: string;
    user: string;
    variables: Record<AiPromptVariable, string>;
}
