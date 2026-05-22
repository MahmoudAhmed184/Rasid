import {
    type PendingDownloadCleanup,
    type StoredNotificationPayload,
    type StoredState,
} from './schema';
import {
    createBrowserSessionStorageClient,
    createBrowserStorageClient,
    type StorageClient,
} from '../browser/storage-client';
import { SNAPSHOT_KEYS } from './storage-keys';
import { createDownloadCleanupStorage } from './modules/download-cleanup-storage';
import { createAiSecretStorage } from './modules/ai-secret-storage';
import { createMonitoringStorage, type IngestedJobsResult } from './modules/monitoring-storage';
import { createNotificationPayloadStorage } from './modules/notification-payload-storage';
import { createPromptStorage } from './modules/prompt-storage';
import { createRuntimeStorage, type RuntimeStatePatch } from './modules/runtime-storage';
import { createSettingsStorage, getLegacySettingsApiKey } from './modules/settings-storage';
import { normalizeStoredStateSnapshot } from './snapshot-state';
import { createTrackingStorage } from './modules/tracking-storage';
import type { JobRecord, TrackedProject } from '../../entities/job/model';
import type { ExtensionStats } from '../../entities/monitoring/model';
import type { PromptTemplate } from '../../entities/prompt/model';
import type { RuntimeState, SignalRState } from '../../entities/runtime/model';
import type { ExtensionSettings } from '../../entities/settings/model';

export type { IngestedJobsResult } from './modules/monitoring-storage';
export type { RuntimeStatePatch } from './modules/runtime-storage';

export interface ExtensionStorage {
    ensureDefaults(): Promise<StoredState>;
    getSnapshot(): Promise<StoredState>;
    getSettings(): Promise<ExtensionSettings>;
    updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings>;
    getNotificationsEnabled(): Promise<boolean>;
    setNotificationsEnabled(enabled: boolean): Promise<boolean>;
    getPrompts(): Promise<PromptTemplate[]>;
    setPrompts(prompts: PromptTemplate[]): Promise<PromptTemplate[]>;
    getProposalTemplate(): Promise<string>;
    setProposalTemplate(template: string): Promise<string>;
    getTrackedProjects(): Promise<Record<string, TrackedProject>>;
    setTrackedProjects(
        projects: Record<string, TrackedProject>
    ): Promise<Record<string, TrackedProject>>;
    getRuntimeState(): Promise<RuntimeState>;
    patchRuntimeState(patch: RuntimeStatePatch): Promise<RuntimeState>;
    setSignalRState(state: SignalRState): Promise<SignalRState>;
    ingestJobs(jobs: JobRecord[]): Promise<IngestedJobsResult>;
    mergeRecentJobs(jobs: JobRecord[]): Promise<JobRecord[]>;
    touchLastCheck(reason: string): Promise<ExtensionStats>;
    storeNotificationPayload(
        notificationId: string,
        payload: StoredNotificationPayload
    ): Promise<void>;
    removeNotificationPayload(notificationId: string): Promise<void>;
    consumeNotificationPayload(notificationId: string): Promise<StoredNotificationPayload | null>;
    pruneNotificationPayloads(): Promise<number>;
    storePendingDownloadCleanup(payload: PendingDownloadCleanup): Promise<void>;
    consumePendingDownloadCleanup(downloadId: number): Promise<PendingDownloadCleanup | null>;
    listPendingDownloadCleanups(): Promise<PendingDownloadCleanup[]>;
    pruneExpiredDownloadCleanups(): Promise<PendingDownloadCleanup[]>;
}

function jsonEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function createExtensionStorage(
    client: StorageClient = createBrowserStorageClient(),
    secretClient: StorageClient = createBrowserSessionStorageClient()
): ExtensionStorage {
    const aiSecretStorage = createAiSecretStorage(secretClient);
    const settingsStorage = createSettingsStorage(client, aiSecretStorage);
    const promptStorage = createPromptStorage(client);
    const trackingStorage = createTrackingStorage(client);
    const runtimeStorage = createRuntimeStorage(client);
    const monitoringStorage = createMonitoringStorage(client);
    const notificationPayloadStorage = createNotificationPayloadStorage(client);
    const downloadCleanupStorage = createDownloadCleanupStorage(client);

    async function readSnapshotFields(): Promise<Record<string, unknown>> {
        return client.get(SNAPSHOT_KEYS);
    }

    async function writePatch(patch: Partial<StoredState>): Promise<void> {
        if (Object.keys(patch).length === 0) {
            return;
        }

        await client.set(patch as Record<string, unknown>);
    }

    async function getSnapshot(): Promise<StoredState> {
        return normalizeStoredStateSnapshot(await readSnapshotFields());
    }

    async function ensureDefaults(): Promise<StoredState> {
        const raw = await readSnapshotFields();
        const legacyApiKey = getLegacySettingsApiKey(raw.settings);

        if (legacyApiKey) {
            await aiSecretStorage.setAiApiKey(legacyApiKey);
        }

        const normalized = normalizeStoredStateSnapshot(raw);
        const patchEntries: Array<[keyof StoredState, StoredState[keyof StoredState]]> = [];

        for (const key of SNAPSHOT_KEYS) {
            const rawValue = raw[key];
            const normalizedValue = normalized[key];

            if (!jsonEqual(rawValue, normalizedValue)) {
                patchEntries.push([key, normalizedValue]);
            }
        }

        const patch = Object.fromEntries(patchEntries) as Partial<StoredState>;
        await writePatch(patch);
        return normalized;
    }

    async function ingestJobs(jobs: JobRecord[]): Promise<IngestedJobsResult> {
        const snapshot = await getSnapshot();
        return monitoringStorage.ingestJobs(snapshot, jobs);
    }

    async function mergeRecentJobs(jobs: JobRecord[]): Promise<JobRecord[]> {
        return monitoringStorage.mergeRecentJobs(jobs);
    }

    async function touchLastCheck(reason: string): Promise<ExtensionStats> {
        const runtime = await runtimeStorage.getRuntimeState();
        return monitoringStorage.touchLastCheck(runtime, reason);
    }

    return {
        ensureDefaults,
        getSnapshot,
        getSettings: settingsStorage.getSettings,
        updateSettings: settingsStorage.updateSettings,
        getNotificationsEnabled: settingsStorage.getNotificationsEnabled,
        setNotificationsEnabled: settingsStorage.setNotificationsEnabled,
        getPrompts: promptStorage.getPrompts,
        setPrompts: promptStorage.setPrompts,
        getProposalTemplate: settingsStorage.getProposalTemplate,
        setProposalTemplate: settingsStorage.setProposalTemplate,
        getTrackedProjects: trackingStorage.getTrackedProjects,
        setTrackedProjects: trackingStorage.setTrackedProjects,
        getRuntimeState: runtimeStorage.getRuntimeState,
        patchRuntimeState: runtimeStorage.patchRuntimeState,
        setSignalRState: runtimeStorage.setSignalRState,
        ingestJobs,
        mergeRecentJobs,
        touchLastCheck,
        storeNotificationPayload: notificationPayloadStorage.storeNotificationPayload,
        removeNotificationPayload: notificationPayloadStorage.removeNotificationPayload,
        consumeNotificationPayload: notificationPayloadStorage.consumeNotificationPayload,
        pruneNotificationPayloads: notificationPayloadStorage.pruneNotificationPayloads,
        storePendingDownloadCleanup: downloadCleanupStorage.storePendingDownloadCleanup,
        consumePendingDownloadCleanup: downloadCleanupStorage.consumePendingDownloadCleanup,
        listPendingDownloadCleanups: downloadCleanupStorage.listPendingDownloadCleanups,
        pruneExpiredDownloadCleanups: downloadCleanupStorage.pruneExpiredDownloadCleanups,
    };
}
