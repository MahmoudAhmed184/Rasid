import type { ProjectAttachment } from '../job/model';

export type AiProviderId = 'openai' | 'gemini' | 'claude';

export interface AiRequestContext {
    title: string;
    description: string;
    budget?: string;
    duration?: string;
    clientName?: string;
    clientType?: string;
    url?: string;
    category?: string;
    tags?: string[] | string;
    publishDate?: string;
    projectId?: string;
    projectStatus?: string;
    hiringRate?: string;
    openProjects?: string;
    underwayProjects?: string;
    clientJoined?: string;
    communications?: string;
    attachments?: ProjectAttachment[];
}
