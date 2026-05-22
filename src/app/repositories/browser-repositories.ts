import type { BackupRepository } from '../../features/backup/repository';
import { createBackupRepository } from '../../features/backup/repository';
import type { MonitoringRepository } from '../../features/monitoring/repository';
import { createMonitoringRepository } from '../../features/monitoring/repository';
import type { TrackingRepository } from '../../features/monitoring/tracking-repository';
import { createTrackingRepository } from '../../features/monitoring/tracking-repository';
import type { PromptRepository } from '../../features/proposals/prompt-repository';
import { createPromptRepository } from '../../features/proposals/prompt-repository';
import type { ProposalRepository } from '../../features/proposals/proposal-repository';
import { createProposalRepository } from '../../features/proposals/proposal-repository';
import type { SettingsRepository } from '../../features/settings/repository';
import { createSettingsRepository } from '../../features/settings/repository';
import {
    createBrowserSessionStorageClient,
    createBrowserStorageClient,
} from '../../shared/browser/storage-client';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import { createExtensionStorage } from '../../shared/storage/extension-storage';
import { createAiSecretStorage } from '../../shared/storage/modules/ai-secret-storage';

interface BrowserStorageComposition {
    readonly extensionStorage: ExtensionStorage;
    readonly backupRepository: BackupRepository;
    readonly monitoringRepository: MonitoringRepository;
    readonly promptRepository: PromptRepository;
    readonly proposalRepository: ProposalRepository;
    readonly settingsRepository: SettingsRepository;
    readonly trackingRepository: TrackingRepository;
}

export type BrowserRepositories = BrowserStorageComposition;

export type PlatformContentRepositories = Pick<
    BrowserStorageComposition,
    'promptRepository' | 'proposalRepository' | 'trackingRepository'
>;

export type ChatGptBridgeRepositories = Pick<BrowserStorageComposition, 'proposalRepository'>;

function createStorageComposition() {
    const storageClient = createBrowserStorageClient();
    const secretClient = createBrowserSessionStorageClient();
    const aiSecretStorage = createAiSecretStorage(secretClient);
    const extensionStorage = createExtensionStorage(storageClient, secretClient);

    return {
        aiSecretStorage,
        storageClient,
        extensionStorage,
    };
}

function composeBrowserStorage(): BrowserStorageComposition {
    const { aiSecretStorage, storageClient, extensionStorage } = createStorageComposition();

    return {
        extensionStorage,
        backupRepository: createBackupRepository(storageClient, aiSecretStorage),
        monitoringRepository: createMonitoringRepository(extensionStorage),
        promptRepository: createPromptRepository(extensionStorage),
        proposalRepository: createProposalRepository(extensionStorage, storageClient),
        settingsRepository: createSettingsRepository(extensionStorage),
        trackingRepository: createTrackingRepository(extensionStorage),
    };
}

export function createBrowserRepositories(): BrowserRepositories {
    return composeBrowserStorage();
}

export function createPlatformContentRepositories(): PlatformContentRepositories {
    const { storageClient, extensionStorage } = createStorageComposition();

    return {
        promptRepository: createPromptRepository(extensionStorage),
        proposalRepository: createProposalRepository(extensionStorage, storageClient),
        trackingRepository: createTrackingRepository(extensionStorage),
    };
}

export function createChatGptBridgeRepositories(): ChatGptBridgeRepositories {
    const { storageClient, extensionStorage } = createStorageComposition();

    return {
        proposalRepository: createProposalRepository(extensionStorage, storageClient),
    };
}
