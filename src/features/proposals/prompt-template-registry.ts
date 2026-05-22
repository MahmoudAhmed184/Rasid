import { type AiRequestContext } from '../../entities/ai/model';
import type { NormalizedAiPrompt, PromptTemplateRecord } from './prompt-types';
import { type AiPromptVariable } from './prompt-variables';

function cleanText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function wrapUntrustedField(field: AiPromptVariable, value: string): string {
    if (!value) {
        return '';
    }

    return `[[BEGIN_UNTRUSTED_${field.toUpperCase()}]]\n${value}\n[[END_UNTRUSTED_${field.toUpperCase()}]]`;
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
        .map((attachment, index) => {
            const name = cleanText(attachment.name);
            return name || `مرفق ${index + 1}`;
        })
        .filter(Boolean)
        .join('\n');
}

function interpolate(template: string, values: Record<string, string>): string {
    return template.replace(/\{([a-z0-9_]+)\}/gi, (_, key: string) => values[key] ?? '');
}

function buildPromptVariables(context: AiRequestContext): Record<AiPromptVariable, string> {
    const variables: Record<AiPromptVariable, string> = {
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

    return Object.fromEntries(
        Object.entries(variables).map(([field, value]) => [
            field,
            wrapUntrustedField(field as AiPromptVariable, value),
        ])
    ) as Record<AiPromptVariable, string>;
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
        variables,
    };
}
