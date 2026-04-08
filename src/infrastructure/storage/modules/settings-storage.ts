import { DEFAULT_PROPOSAL_TEMPLATE, DEFAULT_SETTINGS } from '../schema';
import type { StorageClient } from '../storage-client';
import { STORAGE_FIELDS } from '../storage-keys';
import {
    DEFAULT_MONITORED_PLATFORMS,
    clampPollingInterval,
    type ExtensionSettings,
    type MonitoredPlatforms,
} from '../../../models/settings';
import { isPlatformId, PLATFORM_IDS } from '../../../platforms/platform-ids';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeAiExecutionMode(value: unknown): 'bridge' | 'direct' {
    return value === 'direct' ? 'direct' : 'bridge';
}

function normalizeAiProvider(value: unknown): 'openai' | 'gemini' | 'claude' {
    if (value === 'gemini' || value === 'claude') {
        return value;
    }

    return 'openai';
}

function normalizeMonitoredPlatforms(value: unknown): MonitoredPlatforms {
    if (!isObject(value)) {
        return { ...DEFAULT_MONITORED_PLATFORMS };
    }

    const next = { ...DEFAULT_MONITORED_PLATFORMS };

    for (const platformId of PLATFORM_IDS) {
        if (isPlatformId(platformId) && typeof value[platformId] === 'boolean') {
            next[platformId] = value[platformId];
        }
    }

    return next;
}

export function normalizeSettings(value: unknown): ExtensionSettings {
    if (!isObject(value)) {
        return { ...DEFAULT_SETTINGS };
    }

    return {
        ...DEFAULT_SETTINGS,
        ...value,
        monitoredPlatforms: normalizeMonitoredPlatforms(value.monitoredPlatforms),
        aiExecutionMode: normalizeAiExecutionMode(value.aiExecutionMode),
        aiProvider: normalizeAiProvider(value.aiProvider),
        aiModel: typeof value.aiModel === 'string' ? value.aiModel.trim() : '',
        aiApiKey: typeof value.aiApiKey === 'string' ? value.aiApiKey.trim() : '',
        aiSystemPrompt: typeof value.aiSystemPrompt === 'string' ? value.aiSystemPrompt : '',
        interval: clampPollingInterval(value.interval),
        signalrServerUrl:
            typeof value.signalrServerUrl === 'string' ? value.signalrServerUrl.trim() : '',
        aiChatUrl:
            typeof value.aiChatUrl === 'string' && value.aiChatUrl.length > 0
                ? value.aiChatUrl
                : DEFAULT_SETTINGS.aiChatUrl,
    };
}

export function normalizeProposalTemplate(value: unknown): string {
    return typeof value === 'string' ? value : DEFAULT_PROPOSAL_TEMPLATE;
}

export interface SettingsStorageModule {
    getSettings(): Promise<ExtensionSettings>;
    updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings>;
    getNotificationsEnabled(): Promise<boolean>;
    setNotificationsEnabled(enabled: boolean): Promise<boolean>;
    getProposalTemplate(): Promise<string>;
    setProposalTemplate(template: string): Promise<string>;
}

export function createSettingsStorage(client: StorageClient): SettingsStorageModule {
    async function getSettings(): Promise<ExtensionSettings> {
        const response = await client.get(STORAGE_FIELDS.settings);
        return normalizeSettings(response[STORAGE_FIELDS.settings]);
    }

    return {
        getSettings,
        async updateSettings(patch) {
            const current = await getSettings();
            const next = normalizeSettings({ ...current, ...patch });
            await client.set({ [STORAGE_FIELDS.settings]: next });
            return next;
        },
        async getNotificationsEnabled() {
            const response = await client.get(STORAGE_FIELDS.notificationsEnabled);
            return response[STORAGE_FIELDS.notificationsEnabled] !== false;
        },
        async setNotificationsEnabled(enabled) {
            const next = enabled !== false;
            await client.set({ [STORAGE_FIELDS.notificationsEnabled]: next });
            return next;
        },
        async getProposalTemplate() {
            const response = await client.get(STORAGE_FIELDS.proposalTemplate);
            return normalizeProposalTemplate(response[STORAGE_FIELDS.proposalTemplate]);
        },
        async setProposalTemplate(template) {
            const next = normalizeProposalTemplate(template);
            await client.set({ [STORAGE_FIELDS.proposalTemplate]: next });
            return next;
        },
    };
}
