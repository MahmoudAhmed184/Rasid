import type { ExtensionStorage } from '../storage/extension-storage';
import { createExtensionStorage } from '../storage/extension-storage';
import { createBrowserStorageClient } from './storage-client';
import type { BackupRepository } from '../../features/backup/repository';
import { createBackupRepository } from '../../features/backup/repository';
import type { MonitoringRepository } from '../../features/monitoring/repository';
import { createMonitoringRepository } from '../../features/monitoring/repository';
import type { PromptRepository } from '../../features/proposals/prompt-repository';
import { createPromptRepository } from '../../features/proposals/prompt-repository';
import type { ProposalRepository } from '../../features/proposals/proposal-repository';
import { createProposalRepository } from '../../features/proposals/proposal-repository';
import type { SettingsRepository } from '../../features/settings/repository';
import { createSettingsRepository } from '../../features/settings/repository';
import type { TrackingRepository } from '../../features/monitoring/tracking-repository';
import { createTrackingRepository } from '../../features/monitoring/tracking-repository';

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
