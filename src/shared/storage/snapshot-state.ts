import type { StoredState } from './schema';
import { normalizeMonitoringFields } from './modules/monitoring-storage';
import { normalizePrompts } from './modules/prompt-storage';
import { normalizeRuntime } from './modules/runtime-storage';
import {
    normalizeProposalTemplate,
    normalizeSettings,
    sanitizeSettingsForPersistentStorage,
} from './modules/settings-storage';
import { normalizeTrackedProjects } from './modules/tracking-storage';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function normalizeStoredStateSnapshot(value: Record<string, unknown>): StoredState {
    return {
        settings: sanitizeSettingsForPersistentStorage(normalizeSettings(value.settings)),
        ...normalizeMonitoringFields(value),
        trackedProjects: normalizeTrackedProjects(value.trackedProjects),
        prompts: normalizePrompts(value.prompts),
        proposalTemplate: normalizeProposalTemplate(value.proposalTemplate),
        notificationsEnabled: value.notificationsEnabled !== false,
        runtime: normalizeRuntime(value.runtime),
    };
}

export function normalizeImportedState(value: unknown): StoredState {
    if (!isRecord(value)) {
        throw new Error('Invalid backup payload.');
    }

    return normalizeStoredStateSnapshot(value);
}
