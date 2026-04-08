import { debugFetchMonitoringSources } from '../monitoring/fetch-platform-html';
import type { JobBatchResult } from '../monitoring/job-batch-publisher';
import type { ProposalGenerator } from '../proposals/generate-proposal';
import type { BackgroundMessageHandlerMap } from './background-messages';
import type { AudioService } from '../../infrastructure/audio/service';
import { downloadZipArchive } from '../../infrastructure/downloads/zip-downloads';
import type { NotificationService } from '../../infrastructure/notifications/service';
import type { SignalRManager } from '../../infrastructure/realtime/signalr-manager';
import type { ExtensionStorage } from '../../infrastructure/storage/extension-storage';
import type { PlatformMonitoringAdapter } from '../../platforms/contracts';

interface BackgroundRuntimeHandlerDependencies {
    readonly storage: ExtensionStorage;
    readonly notifications: NotificationService;
    readonly audio: AudioService;
    readonly signalr: SignalRManager;
    readonly monitoring: readonly PlatformMonitoringAdapter[];
    readonly proposals: ProposalGenerator;
    readonly runPolling: (reason: string) => Promise<JobBatchResult>;
}

export function createBackgroundRuntimeHandlers(
    deps: BackgroundRuntimeHandlerDependencies
): BackgroundMessageHandlerMap {
    return {
        checkNow: () => deps.runPolling('manual-check'),
        async testNotification() {
            await deps.notifications.showTestNotification();
            return { success: true } as const;
        },
        async testSound() {
            await deps.audio.playNotification();
            return { success: true } as const;
        },
        async updateAlarm(message) {
            await deps.storage.updateSettings({ interval: message.interval });
            await deps.signalr.bootstrap('settings-updated');
            return { success: true } as const;
        },
        async reconnectSignalR() {
            await deps.signalr.reconnect();
            return { success: true } as const;
        },
        async disconnectSignalR() {
            await deps.signalr.disconnect();
            return { success: true } as const;
        },
        debugFetch: async () => {
            const settings = await deps.storage.getSettings();
            const enabledMonitoring = deps.monitoring.filter(
                (adapter) => adapter.resolveFeeds(settings).length > 0
            );

            return debugFetchMonitoringSources(enabledMonitoring);
        },
        generateProposal: (message) => deps.proposals.generate(message.templateId, message.context),
        downloadZip: (message) => downloadZipArchive(message.filename, [...message.files]),
    };
}
