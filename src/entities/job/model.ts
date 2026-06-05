import type { PlatformId } from '../platform/model';

export type JobCategory = 'development' | 'ai' | 'all';

export interface ProjectAttachment {
    name: string;
    url: string;
}

export interface JobRecord {
    id: string;
    title: string;
    url: string;
    platformId?: PlatformId;
    budget?: string;
    description?: string;
    duration?: string;
    hiringRate?: string;
    registrationDate?: string;
    status?: string;
    communications?: string;
    poster?: string;
    time?: string;
    postedAt?: string;
    lastInteractionAt?: string;
    bidsText?: string;
    category?: string;
    tags?: string[];
    clientName?: string;
    clientType?: string;
    attachments?: ProjectAttachment[];
}

export interface TrackedProject {
    id?: string;
    title: string;
    url: string;
    platformId?: PlatformId;
    status?: string;
    communications?: string;
    lastChecked?: string;
    budget?: string;
    duration?: string;
    publishDate?: string;
    clientName?: string;
    tags?: string;
    category?: string;
    hiringRate?: string;
    openProjects?: string;
    underwayProjects?: string;
    clientJoined?: string;
    clientType?: string;
    attachments?: ProjectAttachment[];
}
