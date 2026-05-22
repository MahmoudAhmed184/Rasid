import { DEFAULT_PROPOSAL_TEMPLATE, DEFAULT_SETTINGS } from '../schema';
import type { StorageClient } from '../../browser/storage-client';
import { STORAGE_FIELDS } from '../storage-keys';
import { normalizeAiChatUrl } from '../../../entities/ai/chat-url';
import { type AiSecretStorageModule, normalizeAiApiKey } from './ai-secret-storage';
import {
    DEFAULT_MONITORED_PLATFORMS,
    SUPPORTED_MONITORING_PLATFORM_IDS,
    clampPollingInterval,
    type AiExecutionMode,
    type ExtensionSettings,
    type MonitoredPlatforms,
    type NotificationMode,
} from '../../../entities/settings/model';
import type { AiProviderId } from '../../../entities/ai/model';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function normalizeText(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function normalizeTrimmedText(value: unknown, fallback = ''): string {
    return normalizeText(value, fallback).trim();
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return Math.max(0, numeric);
}

function normalizePercentage(value: unknown, fallback: number): number {
    return Math.min(100, normalizeNonNegativeNumber(value, fallback));
}

function normalizeTimeOfDay(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return match ? trimmed : fallback;
}

function normalizeAiExecutionMode(value: unknown): AiExecutionMode {
    return value === 'direct' ? 'direct' : 'bridge';
}

function normalizeAiProvider(value: unknown): AiProviderId {
    if (value === 'gemini' || value === 'claude') {
        return value;
    }

    return 'openai';
}

function normalizeNotificationMode(value: unknown): NotificationMode {
    if (value === 'signalr' || value === 'polling') {
        return value;
    }

    return 'auto';
}

function normalizeMonitoredPlatforms(value: unknown): MonitoredPlatforms {
    if (!isObject(value)) {
        return { ...DEFAULT_MONITORED_PLATFORMS };
    }

    const next = { ...DEFAULT_MONITORED_PLATFORMS };

    for (const platformId of SUPPORTED_MONITORING_PLATFORM_IDS) {
        if (typeof value[platformId] === 'boolean') {
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
        systemEnabled: normalizeBoolean(value.systemEnabled, DEFAULT_SETTINGS.systemEnabled),
        monitoredPlatforms: normalizeMonitoredPlatforms(value.monitoredPlatforms),
        development: normalizeBoolean(value.development, DEFAULT_SETTINGS.development),
        ai: normalizeBoolean(value.ai, DEFAULT_SETTINGS.ai),
        all: normalizeBoolean(value.all, DEFAULT_SETTINGS.all),
        sound: normalizeBoolean(value.sound, DEFAULT_SETTINGS.sound),
        aiExecutionMode: normalizeAiExecutionMode(value.aiExecutionMode),
        aiProvider: normalizeAiProvider(value.aiProvider),
        aiModel: normalizeTrimmedText(value.aiModel, DEFAULT_SETTINGS.aiModel),
        aiApiKey: normalizeAiApiKey(value.aiApiKey) || DEFAULT_SETTINGS.aiApiKey,
        aiSystemPrompt:
            normalizeText(value.aiSystemPrompt, DEFAULT_SETTINGS.aiSystemPrompt).trim() ||
            DEFAULT_SETTINGS.aiSystemPrompt,
        interval: clampPollingInterval(value.interval),
        notificationMode: normalizeNotificationMode(value.notificationMode),
        signalrServerUrl: '',
        aiChatUrl: normalizeAiChatUrl(value.aiChatUrl),
        minBudget: normalizeNonNegativeNumber(value.minBudget, DEFAULT_SETTINGS.minBudget),
        minHiringRate: normalizePercentage(value.minHiringRate, DEFAULT_SETTINGS.minHiringRate),
        keywordsInclude: normalizeText(value.keywordsInclude, DEFAULT_SETTINGS.keywordsInclude),
        keywordsExclude: normalizeText(value.keywordsExclude, DEFAULT_SETTINGS.keywordsExclude),
        maxDuration: normalizeNonNegativeNumber(value.maxDuration, DEFAULT_SETTINGS.maxDuration),
        minClientAge: normalizeNonNegativeNumber(value.minClientAge, DEFAULT_SETTINGS.minClientAge),
        quietHoursEnabled: normalizeBoolean(
            value.quietHoursEnabled,
            DEFAULT_SETTINGS.quietHoursEnabled
        ),
        quietHoursStart: normalizeTimeOfDay(
            value.quietHoursStart,
            DEFAULT_SETTINGS.quietHoursStart
        ),
        quietHoursEnd: normalizeTimeOfDay(value.quietHoursEnd, DEFAULT_SETTINGS.quietHoursEnd),
    };
}

export function getLegacySettingsApiKey(value: unknown): string {
    if (!isObject(value)) {
        return '';
    }

    return normalizeAiApiKey(value.aiApiKey);
}

export function sanitizeSettingsForPersistentStorage(
    settings: ExtensionSettings
): ExtensionSettings {
    return {
        ...settings,
        aiApiKey: '',
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

export function createSettingsStorage(
    client: StorageClient,
    aiSecrets?: AiSecretStorageModule
): SettingsStorageModule {
    async function getSettings(): Promise<ExtensionSettings> {
        const response = await client.get(STORAGE_FIELDS.settings);
        const rawSettings = response[STORAGE_FIELDS.settings];
        const legacyApiKey = getLegacySettingsApiKey(rawSettings);
        const normalizedSettings = sanitizeSettingsForPersistentStorage(
            normalizeSettings(rawSettings)
        );

        if (aiSecrets && legacyApiKey) {
            await aiSecrets.setAiApiKey(legacyApiKey);
            await client.set({
                [STORAGE_FIELDS.settings]: normalizedSettings,
            });
        }

        return {
            ...normalizedSettings,
            aiApiKey: aiSecrets ? await aiSecrets.getAiApiKey() : legacyApiKey,
        };
    }

    return {
        getSettings,
        async updateSettings(patch) {
            const current = sanitizeSettingsForPersistentStorage(await getSettings());
            const hasApiKeyPatch = Object.prototype.hasOwnProperty.call(patch, 'aiApiKey');

            if (aiSecrets && hasApiKeyPatch) {
                await aiSecrets.setAiApiKey(patch.aiApiKey ?? '');
            }

            const next = sanitizeSettingsForPersistentStorage(
                normalizeSettings({
                    ...current,
                    ...patch,
                    aiApiKey: '',
                })
            );

            await client.set({ [STORAGE_FIELDS.settings]: next });

            return {
                ...next,
                aiApiKey: aiSecrets
                    ? await aiSecrets.getAiApiKey()
                    : normalizeAiApiKey(patch.aiApiKey),
            };
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
