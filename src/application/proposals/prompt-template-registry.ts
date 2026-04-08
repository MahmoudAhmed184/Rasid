import {
    type AiRequestContext,
} from '../../models/ai';
import type { NormalizedAiPrompt, PromptTemplateRecord } from './prompt-types';
import { type AiPromptVariable } from './prompt-variables';

function cleanText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function joinTags(tags: AiRequestContext['tags']): string {
    if (Array.isArray(tags)) {
        return tags
            .map((tag) => String(tag).trim())
            .filter(Boolean)
            .join(', ');
    }

    return typeof tags === 'string' ? tags.trim() : '';
}

function joinAttachments(attachments: AiRequestContext['attachments']): string {
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return '';
    }

    return attachments
        .map((attachment) => {
            const name = cleanText(attachment.name);
            const url = cleanText(attachment.url);

            if (name && url) {
                return `${name}: ${url}`;
            }

            return name || url;
        })
        .filter(Boolean)
        .join('\n');
}

function interpolate(template: string, values: Record<string, string>): string {
    return template.replace(/\{([a-z0-9_]+)\}/gi, (_, key: string) => values[key] ?? '');
}

function buildPromptVariables(context: AiRequestContext): Record<AiPromptVariable, string> {
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
        attachments: joinAttachments(context.attachments),
    };
}

export function renderLegacyPromptTemplate(template: string, context: AiRequestContext): string {
    return interpolate(template, buildPromptVariables(context));
}

export function renderPromptTemplate(
    template: PromptTemplateRecord,
    context: AiRequestContext
): NormalizedAiPrompt {
    const variables = buildPromptVariables(context);
    const system = interpolate(template.system ?? '', variables).trim();
    const user = interpolate(template.user, variables).trim();

    return {
        system,
        user,
        combined: [system, user].filter(Boolean).join('\n\n'),
        variables,
    };
}
