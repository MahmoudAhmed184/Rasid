import { browser } from 'wxt/browser';

import { debugFetchMonitoringSources } from '../../features/monitoring/fetch-platform-html';
import type { JobBatchResult } from '../../features/monitoring/job-batch-publisher';
import type { ProposalGenerator } from '../../features/proposals/generate-proposal';
import type {
    BackgroundMessageHandlerMap,
    BackgroundMessageRequestMap,
    BackgroundMessageResponseMap,
} from './background-messages';
import type { AudioService } from '../../features/notifications/audio-service';
import type { DownloadCleanupService } from '../../features/downloads/download-cleanup-service';
import type { NotificationService } from '../../features/notifications/service';
import type { SignalRManager } from '../../features/realtime/signalr-manager';
import type { OffscreenManager } from '../../features/offscreen/manager';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import type { PlatformMonitoringAdapter } from '../../platforms/contracts';

interface BackgroundRuntimeHandlerDependencies {
    readonly storage: ExtensionStorage;
    readonly notifications: NotificationService;
    readonly downloads: DownloadCleanupService;
    readonly audio: AudioService;
    readonly offscreen: OffscreenManager;
    readonly signalr: SignalRManager;
    readonly monitoring: readonly PlatformMonitoringAdapter[];
    readonly proposals: ProposalGenerator;
    readonly runPolling: (reason: string) => Promise<JobBatchResult>;
}

async function downloadZip(
    deps: BackgroundRuntimeHandlerDependencies,
    message: BackgroundMessageRequestMap['downloadZip']
): Promise<BackgroundMessageResponseMap['downloadZip']> {
    const zipUrl = await deps.offscreen.request('downloads.create-zip-url', {
        filename: message.filename,
        files: message.files,
    });

    if (!zipUrl.success || !zipUrl.objectUrl || !zipUrl.filename) {
        return {
            success: false,
            error: zipUrl.error ?? 'Failed to create ZIP download URL.',
        };
    }

    let downloadId: number;

    try {
        downloadId = await browser.downloads.download({
            url: zipUrl.objectUrl,
            filename: zipUrl.filename,
            saveAs: true,
        });
    } catch (error) {
        try {
            await deps.offscreen.request('downloads.revoke-object-url', {
                objectUrl: zipUrl.objectUrl,
            });
        } catch (cleanupError) {
            console.warn('[background] failed to revoke offscreen object URL', cleanupError);
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    try {
        await deps.downloads.trackObjectUrlDownload({
            downloadId,
            objectUrl: zipUrl.objectUrl,
            filename: zipUrl.filename,
        });
    } catch (error) {
        console.warn('[background] failed to persist download cleanup record', error);
    }

    return {
        success: true,
        downloadId,
    };
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
        downloadZip: (message) => downloadZip(deps, message),
    };
}
