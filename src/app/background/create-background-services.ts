import { type JobBatchResult } from '../../features/monitoring/job-batch-publisher';
import { processRealtimeJobBatch } from '../../features/monitoring/process-realtime-job-batch';
import { runPollingCycle } from '../../features/monitoring/run-polling-cycle';
import { createProposalGenerator } from '../../features/proposals/generate-proposal';
import { createProposalTemplateCatalog } from '../../features/proposals/proposal-template-catalog';
import { createBackgroundRuntimeHandlers } from './background-runtime-handlers';
import { createDownloadCleanupService } from '../../features/downloads/download-cleanup-service';
import { createAudioService } from '../../features/notifications/audio-service';
import { createOffscreenManager } from '../../features/offscreen/manager';
import { createNotificationService } from '../../features/notifications/service';
import { createSignalRManager } from '../../features/realtime/signalr-manager';
import { createExtensionStorage } from '../../shared/storage/extension-storage';
import { createPlatformMonitoringHtmlParser } from '../../platforms/monitoring-html-parser';
import { createPlatformMonitoringAdapters } from '../../platforms/registry';
import { createProposalRepository } from '../../features/proposals/proposal-repository';
import {
    createBrowserSessionStorageClient,
    createBrowserStorageClient,
} from '../../shared/browser/storage-client';

export interface BackgroundApp {
    readonly notifications: ReturnType<typeof createNotificationService>;
    readonly downloads: ReturnType<typeof createDownloadCleanupService>;
    readonly signalr: ReturnType<typeof createSignalRManager>;
    readonly runtimeMessageHandlers: ReturnType<typeof createBackgroundRuntimeHandlers>;
    ensureReady(reason: string): Promise<void>;
}

export function createBackgroundApp(): BackgroundApp {
    const storageClient = createBrowserStorageClient();
    const secretClient = createBrowserSessionStorageClient();
    const storage = createExtensionStorage(storageClient, secretClient);
    const proposalRepository = createProposalRepository(storage, storageClient);
    const notifications = createNotificationService(storage);
    const offscreen = createOffscreenManager({
        mode: import.meta.env.CHROME ? 'document' : 'local',
        documentPath: '/offscreen.html',
    });

    if (!import.meta.env.CHROME) {
        offscreen.registerLocalHandler('downloads.create-zip-url', async (payload) => {
            const { createZipObjectUrl } = await import('../../features/downloads/zip-downloads');

            return createZipObjectUrl(payload.filename, payload.files);
        });
        offscreen.registerLocalHandler('downloads.revoke-object-url', async (payload) => {
            const { revokeZipObjectUrl } = await import('../../features/downloads/zip-downloads');

            revokeZipObjectUrl(payload.objectUrl);
            return { success: true };
        });
    }

    const audio = createAudioService(offscreen);
    const downloads = createDownloadCleanupService(storage, offscreen);
    const monitoringHtmlParser = createPlatformMonitoringHtmlParser(offscreen);
    const platformMonitoring = createPlatformMonitoringAdapters(monitoringHtmlParser);
    const proposalTemplates = createProposalTemplateCatalog(storage);
    const proposalGenerator = createProposalGenerator({
        settings: storage,
        templates: proposalTemplates,
        ...(import.meta.env.WXT_ENABLE_UNSAFE_DIRECT_AI === 'true'
            ? {
                  loadProviders: async () => {
                      const { createAiProviderRegistry } =
                          await import('../../entities/ai/provider-registry');

                      return createAiProviderRegistry();
                  },
              }
            : {}),
    });
    let ingestionQueue: Promise<void> = Promise.resolve();

    function enqueueIngestion<T>(task: () => Promise<T>): Promise<T> {
        const run = ingestionQueue.then(task, task);
        ingestionQueue = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    }

    async function runPolling(reason: string): Promise<JobBatchResult> {
        return enqueueIngestion(() =>
            runPollingCycle({
                storage,
                notifyJobs: (jobs) => notifications.showJobsNotification(jobs),
                playNotificationSound: () => audio.playNotification(),
                reason,
                monitoring: platformMonitoring,
            })
        );
    }

    const signalr = createSignalRManager({
        storage,
        onJobsReceived: async (jobs) => {
            await enqueueIngestion(() =>
                processRealtimeJobBatch({
                    jobs,
                    storage,
                    notifyJobs: (batch) => notifications.showJobsNotification(batch),
                    playNotificationSound: () => audio.playNotification(),
                })
            );
        },
        onPollingFallback: async (reason) => {
            await runPolling(reason);
        },
        onAdminMessageReceived: async (payload) => {
            const msg = {
                id: payload.id,
                message: payload.message,
                url: payload.url ?? null,
                receivedAt: payload.createdAt,
                read: false,
            };

            await storage.storeAdminMessage(msg);

            try {
                await notifications.showAdminMessageNotification(msg);
            } catch (error) {
                console.warn('[background] admin message notification failed:', error);
            }
        },
    });

    const runtimeMessageHandlers = createBackgroundRuntimeHandlers({
        storage,
        notifications,
        downloads,
        audio,
        offscreen,
        signalr,
        monitoring: platformMonitoring,
        proposals: proposalGenerator,
        proposalRepository,
        runPolling,
    });

    let bootstrapPromise: Promise<void> | null = null;
    let isBootstrapped = false;

    async function bootstrap(reason: string): Promise<void> {
        await storage.ensureDefaults();
        await offscreen.bootstrap();
        await downloads.reconcilePendingCleanups();
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
        downloads,
        signalr,
        runtimeMessageHandlers,
        ensureReady,
    };
}
