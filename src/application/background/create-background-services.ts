import { type JobBatchResult } from '../monitoring/job-batch-publisher';
import { processRealtimeJobBatch } from '../monitoring/process-realtime-job-batch';
import { runPollingCycle } from '../monitoring/run-polling-cycle';
import { createProposalGenerator } from '../proposals/generate-proposal';
import { createProposalTemplateCatalog } from '../proposals/proposal-template-catalog';
import { createBackgroundRuntimeHandlers } from '../runtime/background-runtime-handlers';
import { createAiProviderRegistry } from '../../infrastructure/ai/provider-registry';
import { createAudioService } from '../../infrastructure/audio/service';
import { createOffscreenManager } from '../../infrastructure/offscreen/manager';
import { createNotificationService } from '../../infrastructure/notifications/service';
import { createSignalRManager } from '../../infrastructure/realtime/signalr-manager';
import { createExtensionStorage } from '../../infrastructure/storage/extension-storage';
import { createPlatformMonitoringHtmlParser } from '../../platforms/monitoring-html-parser';
import { createPlatformMonitoringAdapters } from '../../platforms/platform-modules';

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
