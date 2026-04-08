import type { ExtensionStorage } from './extension-storage';
import { createExtensionStorage } from './extension-storage';
import { createBrowserStorageClient } from './storage-client';
import type { BackupRepository } from './repositories/backup-repository';
import { createBackupRepository } from './repositories/backup-repository';
import type { MonitoringRepository } from './repositories/monitoring-repository';
import { createMonitoringRepository } from './repositories/monitoring-repository';
import type { PromptRepository } from './repositories/prompt-repository';
import { createPromptRepository } from './repositories/prompt-repository';
import type { ProposalRepository } from './repositories/proposal-repository';
import { createProposalRepository } from './repositories/proposal-repository';
import type { SettingsRepository } from './repositories/settings-repository';
import { createSettingsRepository } from './repositories/settings-repository';
import type { TrackingRepository } from './repositories/tracking-repository';
import { createTrackingRepository } from './repositories/tracking-repository';

export interface BrowserRepositories {
    readonly extensionStorage: ExtensionStorage;
    readonly backupRepository: BackupRepository;
    readonly monitoringRepository: MonitoringRepository;
    readonly promptRepository: PromptRepository;
    readonly proposalRepository: ProposalRepository;
    readonly settingsRepository: SettingsRepository;
    readonly trackingRepository: TrackingRepository;
}

export function createBrowserRepositories(): BrowserRepositories {
    const storageClient = createBrowserStorageClient();
    const extensionStorage = createExtensionStorage(storageClient);

    return {
        extensionStorage,
        backupRepository: createBackupRepository(storageClient),
        monitoringRepository: createMonitoringRepository(extensionStorage),
        promptRepository: createPromptRepository(extensionStorage),
        proposalRepository: createProposalRepository(extensionStorage, storageClient),
        settingsRepository: createSettingsRepository(extensionStorage),
        trackingRepository: createTrackingRepository(extensionStorage),
    };
}

const defaultBrowserRepositories = createBrowserRepositories();

export const extensionStorage = defaultBrowserRepositories.extensionStorage;
export const backupRepository = defaultBrowserRepositories.backupRepository;
export const monitoringRepository = defaultBrowserRepositories.monitoringRepository;
export const promptRepository = defaultBrowserRepositories.promptRepository;
export const proposalRepository = defaultBrowserRepositories.proposalRepository;
export const settingsRepository = defaultBrowserRepositories.settingsRepository;
export const trackingRepository = defaultBrowserRepositories.trackingRepository;
