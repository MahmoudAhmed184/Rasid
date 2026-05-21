import type { StoredState } from './schema';

export const STORAGE_FIELDS = {
    settings: 'settings',
    seenJobs: 'seenJobs',
    recentJobs: 'recentJobs',
    stats: 'stats',
    trackedProjects: 'trackedProjects',
    prompts: 'prompts',
    proposalTemplate: 'proposalTemplate',
    notificationsEnabled: 'notificationsEnabled',
    runtime: 'runtime',
} as const;

export const SNAPSHOT_KEYS = Object.values(STORAGE_FIELDS) as Array<keyof StoredState>;
export const NOTIFICATION_KEY_PREFIX = 'notification:';
