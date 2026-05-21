import { type JobBatchResult } from '../../features/monitoring/job-batch-publisher';
import { processRealtimeJobBatch } from '../../features/monitoring/process-realtime-job-batch';
import { runPollingCycle } from '../../features/monitoring/run-polling-cycle';
import { createProposalGenerator } from '../../features/proposals/generate-proposal';
import { createProposalTemplateCatalog } from '../../features/proposals/proposal-template-catalog';
import { createBackgroundRuntimeHandlers } from './background-runtime-handlers';
import { createAiProviderRegistry } from '../../entities/ai/provider-registry';
import { createAudioService } from '../../features/notifications/audio-service';
import { createOffscreenManager } from '../../shared/browser/offscreen/manager';
import { createNotificationService } from '../../features/notifications/service';
import { createSignalRManager } from '../../features/realtime/signalr-manager';
import { createExtensionStorage } from '../../shared/storage/extension-storage';
import { createPlatformMonitoringHtmlParser } from '../../platforms/monitoring-html-parser';
import { createPlatformMonitoringAdapters } from '../../platforms/registry';

export interface BackgroundApp {
    readonly notifications: ReturnType<typeof createNotificationService>;
    readonly signalr: ReturnType<typeof createSignalRManager>;
    readonly runtimeMessageHandlers: ReturnType<typeof createBackgroundRuntimeHandlers>;
    ensureReady(reason: string): Promise<void>;
}

export function createBackgroundApp(): BackgroundApp {
    const storage = createExtensionStorage();
    const notifications = createNotificationService(storage);
    const offscreen = createOffscreenManager({
        mode: import.meta.env.CHROME ? 'document' : 'local',
        documentPath: '/offscreen.html',
    });

    if (!import.meta.env.CHROME) {
        offscreen.registerLocalHandler('downloads.download-zip', async (payload) => {
            const { downloadZipArchive } = await import('../../features/downloads/zip-downloads');

            return downloadZipArchive(payload.filename, payload.files);
        });
    }

    const audio = createAudioService(offscreen);
    const monitoringHtmlParser = createPlatformMonitoringHtmlParser(offscreen);
    const platformMonitoring = createPlatformMonitoringAdapters(monitoringHtmlParser);
    const aiProviders = createAiProviderRegistry();
    const proposalTemplates = createProposalTemplateCatalog(storage);
    const proposalGenerator = createProposalGenerator({
        settings: storage,
        templates: proposalTemplates,
        providers: aiProviders,
    });

    async function runPolling(reason: string): Promise<JobBatchResult> {
        return runPollingCycle({
            storage,
            notifyJobs: (jobs) => notifications.showJobsNotification(jobs),
            playNotificationSound: () => audio.playNotification(),
            reason,
            monitoring: platformMonitoring,
        });
    }

    const signalr = createSignalRManager({
        storage,
        onJobsReceived: async (jobs) => {
            await processRealtimeJobBatch({
                jobs,
                storage,
                notifyJobs: (batch) => notifications.showJobsNotification(batch),
                playNotificationSound: () => audio.playNotification(),
            });
        },
        onPollingFallback: async (reason) => {
            await runPolling(reason);
        },
    });

    const runtimeMessageHandlers = createBackgroundRuntimeHandlers({
        storage,
        notifications,
        audio,
        offscreen,
        signalr,
        monitoring: platformMonitoring,
        proposals: proposalGenerator,
        runPolling,
    });

    let bootstrapPromise: Promise<void> | null = null;
    let isBootstrapped = false;

    async function bootstrap(reason: string): Promise<void> {
        await storage.ensureDefaults();
        await offscreen.bootstrap();
        await signalr.bootstrap(reason);
    }

    async function ensureReady(reason: string): Promise<void> {
        if (isBootstrapped) {
            return;
        }

        if (!bootstrapPromise) {
            bootstrapPromise = bootstrap(reason)
                .then(() => {
                    isBootstrapped = true;
                })
                .finally(() => {
                    bootstrapPromise = null;
                });
        }

        await bootstrapPromise;
    }

    return {
        notifications,
        signalr,
        runtimeMessageHandlers,
        ensureReady,
    };
}
