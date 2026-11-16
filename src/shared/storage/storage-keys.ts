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
    language: 'language',
} as const;

export const SNAPSHOT_KEYS: Array<keyof StoredState> = [
    'settings',
    'seenJobs',
    'recentJobs',
    'stats',
    'trackedProjects',
    'prompts',
    'proposalTemplate',
    'notificationsEnabled',
    'runtime',
];
export const NOTIFICATION_KEY_PREFIX = 'notification:';
export const DOWNLOAD_CLEANUP_KEY_PREFIX = 'download-cleanup:';
