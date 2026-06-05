import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';

const factoryMocks = vi.hoisted(() => {
    const noopBatchResult = {
        kind: 'noop',
        source: 'polling',
        reason: 'no-new-jobs',
        totalChecked: 0,
    };
    const storage = {
        ensureDefaults: vi.fn(async () => undefined),
    };
    const notifications = {
        registerHandlers: vi.fn(),
        showJobsNotification: vi.fn(async () => 'notification-id'),
    };
    const offscreen = {
        bootstrap: vi.fn(async () => undefined),
        registerLocalHandler: vi.fn(),
    };
    const audio = {
        playNotification: vi.fn(async () => undefined),
    };
    const downloads = {
        registerHandlers: vi.fn(),
        reconcilePendingCleanups: vi.fn(async () => undefined),
    };
    const signalr = {
        bootstrap: vi.fn(async (_reason?: string) => undefined),
        handleAlarm: vi.fn(async () => true),
        reconnect: vi.fn(async () => undefined),
        disconnect: vi.fn(async () => undefined),
    };
    const runtimeHandlers = {
        testNotification: vi.fn(async () => ({ success: true })),
    };
    const monitoring = [{ id: 'mostaql' }];
    const monitoringHtmlParser = { parse: vi.fn() };
    const aiProviders = { providers: [] };
    const proposalTemplates = { templates: [] };
    const proposalGenerator = { generate: vi.fn(async () => ({ success: false })) };
    const storageClient = { id: 'storageClient' };
    const secretClient = { id: 'secretClient' };
    const proposalRepository = { setPendingBridgePrompt: vi.fn(async () => undefined) };
    const createBrowserStorageClient = vi.fn(() => storageClient);
    const createBrowserSessionStorageClient = vi.fn(() => secretClient);
    const createExtensionStorage = vi.fn(() => storage);
    const createNotificationService = vi.fn(() => notifications);
    const createOffscreenManager = vi.fn(() => offscreen);
    const createAudioService = vi.fn(() => audio);
    const createDownloadCleanupService = vi.fn(() => downloads);
    const createPlatformMonitoringHtmlParser = vi.fn(() => monitoringHtmlParser);
    const createPlatformMonitoringAdapters = vi.fn(() => monitoring);
    const createAiProviderRegistry = vi.fn(() => aiProviders);
    const createProposalTemplateCatalog = vi.fn(() => proposalTemplates);
    const createProposalRepository = vi.fn(() => proposalRepository);
    const createProposalGenerator = vi.fn(() => proposalGenerator);
    const runPollingCycle = vi.fn(async () => noopBatchResult);
    const processRealtimeJobBatch = vi.fn(async () => ({
        ...noopBatchResult,
        source: 'signalr',
    }));
    const createSignalRManager = vi.fn(
        (options: {
            readonly onJobsReceived: (jobs: readonly unknown[]) => Promise<void>;
            readonly onPollingFallback: (reason: string) => Promise<void>;
        }) => {
            state.signalROptions = options;
            return signalr;
        }
    );
    const createBackgroundRuntimeHandlers = vi.fn((deps: unknown) => {
        state.runtimeDeps = deps;
        return runtimeHandlers;
    });
    const state = {
        noopBatchResult,
        storage,
        notifications,
        offscreen,
        audio,
        downloads,
        signalr,
        runtimeHandlers,
        monitoring,
        monitoringHtmlParser,
        aiProviders,
        proposalTemplates,
        proposalGenerator,
        storageClient,
        secretClient,
        proposalRepository,
        createBrowserStorageClient,
        createBrowserSessionStorageClient,
        createExtensionStorage,
        createNotificationService,
        createOffscreenManager,
        createAudioService,
        createDownloadCleanupService,
        createPlatformMonitoringHtmlParser,
        createPlatformMonitoringAdapters,
        createAiProviderRegistry,
        createProposalTemplateCatalog,
        createProposalRepository,
        createProposalGenerator,
        runPollingCycle,
        processRealtimeJobBatch,
        createSignalRManager,
        createBackgroundRuntimeHandlers,
        signalROptions: undefined as
            | {
                  readonly onJobsReceived: (jobs: readonly unknown[]) => Promise<void>;
                  readonly onPollingFallback: (reason: string) => Promise<void>;
              }
            | undefined,
        runtimeDeps: undefined as unknown,
    };

    return {
        state,
        reset() {
            storage.ensureDefaults.mockReset().mockResolvedValue(undefined);
            notifications.registerHandlers.mockReset();
            notifications.showJobsNotification.mockReset().mockResolvedValue('notification-id');
            offscreen.bootstrap.mockReset().mockResolvedValue(undefined);
            offscreen.registerLocalHandler.mockReset();
            audio.playNotification.mockReset().mockResolvedValue(undefined);
            downloads.registerHandlers.mockReset();
            downloads.reconcilePendingCleanups.mockReset().mockResolvedValue(undefined);
            signalr.bootstrap.mockReset().mockResolvedValue(undefined);
            signalr.handleAlarm.mockReset().mockResolvedValue(true);
            signalr.reconnect.mockReset().mockResolvedValue(undefined);
            signalr.disconnect.mockReset().mockResolvedValue(undefined);
            runtimeHandlers.testNotification.mockReset().mockResolvedValue({ success: true });
            proposalRepository.setPendingBridgePrompt.mockReset().mockResolvedValue(undefined);
            createBrowserStorageClient.mockReset().mockReturnValue(storageClient);
            createBrowserSessionStorageClient.mockReset().mockReturnValue(secretClient);
            createExtensionStorage.mockReset().mockReturnValue(storage);
            createNotificationService.mockReset().mockReturnValue(notifications);
            createOffscreenManager.mockReset().mockReturnValue(offscreen);
            createAudioService.mockReset().mockReturnValue(audio);
            createDownloadCleanupService.mockReset().mockReturnValue(downloads);
            createPlatformMonitoringHtmlParser.mockReset().mockReturnValue(monitoringHtmlParser);
            createPlatformMonitoringAdapters.mockReset().mockReturnValue(monitoring);
            createAiProviderRegistry.mockReset().mockReturnValue(aiProviders);
            createProposalTemplateCatalog.mockReset().mockReturnValue(proposalTemplates);
            createProposalRepository.mockReset().mockReturnValue(proposalRepository);
            createProposalGenerator.mockReset().mockReturnValue(proposalGenerator);
            runPollingCycle.mockReset().mockResolvedValue(noopBatchResult);
            processRealtimeJobBatch.mockReset().mockResolvedValue({
                ...noopBatchResult,
                source: 'signalr',
            });
            createSignalRManager.mockReset().mockImplementation((options) => {
                state.signalROptions = options;
                return signalr;
            });
            createBackgroundRuntimeHandlers.mockReset().mockImplementation((deps: unknown) => {
                state.runtimeDeps = deps;
                return runtimeHandlers;
            });
            state.signalROptions = undefined;
            state.runtimeDeps = undefined;
        },
    };
});

vi.mock('../../../../src/shared/storage/extension-storage', () => ({
    createExtensionStorage: factoryMocks.state.createExtensionStorage,
}));

vi.mock('../../../../src/shared/browser/storage-client', () => ({
    createBrowserStorageClient: factoryMocks.state.createBrowserStorageClient,
    createBrowserSessionStorageClient: factoryMocks.state.createBrowserSessionStorageClient,
}));

vi.mock('../../../../src/features/notifications/service', () => ({
    createNotificationService: factoryMocks.state.createNotificationService,
}));

vi.mock('../../../../src/features/offscreen/manager', () => ({
    createOffscreenManager: factoryMocks.state.createOffscreenManager,
}));

vi.mock('../../../../src/features/notifications/audio-service', () => ({
    createAudioService: factoryMocks.state.createAudioService,
}));

vi.mock('../../../../src/features/downloads/download-cleanup-service', () => ({
    createDownloadCleanupService: factoryMocks.state.createDownloadCleanupService,
}));

vi.mock('../../../../src/platforms/monitoring-html-parser', () => ({
    createPlatformMonitoringHtmlParser: factoryMocks.state.createPlatformMonitoringHtmlParser,
}));

vi.mock('../../../../src/platforms/registry', () => ({
    createPlatformMonitoringAdapters: factoryMocks.state.createPlatformMonitoringAdapters,
}));

vi.mock('../../../../src/entities/ai/provider-registry', () => ({
    createAiProviderRegistry: factoryMocks.state.createAiProviderRegistry,
}));

vi.mock('../../../../src/features/proposals/proposal-template-catalog', () => ({
    createProposalTemplateCatalog: factoryMocks.state.createProposalTemplateCatalog,
}));

vi.mock('../../../../src/features/proposals/proposal-repository', () => ({
    createProposalRepository: factoryMocks.state.createProposalRepository,
}));

vi.mock('../../../../src/features/proposals/generate-proposal', () => ({
    createProposalGenerator: factoryMocks.state.createProposalGenerator,
}));

vi.mock('../../../../src/features/realtime/signalr-manager', () => ({
    createSignalRManager: factoryMocks.state.createSignalRManager,
}));

vi.mock('../../../../src/features/monitoring/run-polling-cycle', () => ({
    runPollingCycle: factoryMocks.state.runPollingCycle,
}));

vi.mock('../../../../src/features/monitoring/process-realtime-job-batch', () => ({
    processRealtimeJobBatch: factoryMocks.state.processRealtimeJobBatch,
}));

vi.mock('../../../../src/app/background/background-runtime-handlers', () => ({
    createBackgroundRuntimeHandlers: factoryMocks.state.createBackgroundRuntimeHandlers,
}));

interface CapturedRuntimeDeps {
    readonly runPolling: (reason: string) => Promise<unknown>;
}

interface CapturedBatchOptions {
    readonly jobs?: readonly JobRecord[];
    readonly reason?: string;
    readonly notifyJobs: (jobs: JobRecord[]) => Promise<string>;
    readonly playNotificationSound?: () => Promise<void>;
}

function getRuntimeDeps(): CapturedRuntimeDeps {
    return factoryMocks.state.runtimeDeps as CapturedRuntimeDeps;
}

function getBatchOptions(mock: {
    readonly mock: { readonly calls: unknown[] };
}): CapturedBatchOptions {
    const calls = mock.mock.calls as unknown as Array<[CapturedBatchOptions]>;
    const options = calls.at(-1)?.[0];

    if (!options) {
        throw new Error('Expected batch options to be captured.');
    }

    return options;
}

describe('background app factory', () => {
    beforeEach(() => {
        factoryMocks.reset();
        vi.resetModules();
    });

    it('creates service graph dependencies and bootstraps only once for concurrent readiness', async () => {
        const { createBackgroundApp } =
            await import('../../../../src/app/background/create-background-services');
        const app = createBackgroundApp();

        await Promise.all([
            app.ensureReady('runtime-installed'),
            app.ensureReady('runtime-startup'),
        ]);
        await app.ensureReady('alarm:poll');

        expect(factoryMocks.state.createBrowserStorageClient).toHaveBeenCalledOnce();
        expect(factoryMocks.state.createBrowserSessionStorageClient).toHaveBeenCalledOnce();
        expect(factoryMocks.state.createExtensionStorage).toHaveBeenCalledWith(
            factoryMocks.state.storageClient,
            factoryMocks.state.secretClient
        );
        expect(factoryMocks.state.createProposalRepository).toHaveBeenCalledWith(
            factoryMocks.state.storage,
            factoryMocks.state.storageClient
        );
        expect(factoryMocks.state.createNotificationService).toHaveBeenCalledWith(
            factoryMocks.state.storage
        );
        expect(factoryMocks.state.createOffscreenManager).toHaveBeenCalledWith({
            mode: import.meta.env.CHROME ? 'document' : 'local',
            documentPath: '/offscreen.html',
        });
        expect(factoryMocks.state.createDownloadCleanupService).toHaveBeenCalledWith(
            factoryMocks.state.storage,
            factoryMocks.state.offscreen
        );
        expect(factoryMocks.state.createSignalRManager).toHaveBeenCalledWith(
            expect.objectContaining({
                storage: factoryMocks.state.storage,
            })
        );
        expect(factoryMocks.state.createBackgroundRuntimeHandlers).toHaveBeenCalledWith(
            expect.objectContaining({
                storage: factoryMocks.state.storage,
                notifications: factoryMocks.state.notifications,
                downloads: factoryMocks.state.downloads,
                audio: factoryMocks.state.audio,
                offscreen: factoryMocks.state.offscreen,
                signalr: factoryMocks.state.signalr,
                monitoring: factoryMocks.state.monitoring,
                proposals: factoryMocks.state.proposalGenerator,
                proposalRepository: factoryMocks.state.proposalRepository,
            })
        );
        expect(factoryMocks.state.storage.ensureDefaults).toHaveBeenCalledOnce();
        expect(factoryMocks.state.offscreen.bootstrap).toHaveBeenCalledOnce();
        expect(factoryMocks.state.downloads.reconcilePendingCleanups).toHaveBeenCalledOnce();
        expect(factoryMocks.state.signalr.bootstrap).toHaveBeenCalledOnce();
        expect(factoryMocks.state.signalr.bootstrap).toHaveBeenCalledWith('runtime-installed');
        expect(app.notifications).toBe(factoryMocks.state.notifications);
        expect(app.downloads).toBe(factoryMocks.state.downloads);
        expect(app.signalr).toBe(factoryMocks.state.signalr);
        expect(app.runtimeMessageHandlers).toBe(factoryMocks.state.runtimeHandlers);
    });

    it('retries readiness after a failed bootstrap attempt', async () => {
        factoryMocks.state.storage.ensureDefaults
            .mockRejectedValueOnce(new Error('storage unavailable'))
            .mockResolvedValueOnce(undefined);
        const { createBackgroundApp } =
            await import('../../../../src/app/background/create-background-services');
        const app = createBackgroundApp();

        await expect(app.ensureReady('worker-start')).rejects.toThrow('storage unavailable');
        await expect(app.ensureReady('worker-retry')).resolves.toBeUndefined();

        expect(factoryMocks.state.storage.ensureDefaults).toHaveBeenCalledTimes(2);
        expect(factoryMocks.state.signalr.bootstrap).toHaveBeenCalledOnce();
        expect(factoryMocks.state.signalr.bootstrap).toHaveBeenCalledWith('worker-retry');
    });

    it('wires polling and realtime ingestion through shared notification side effects', async () => {
        const job: JobRecord = {
            id: 'job-1',
            title: 'اختبار تنبيه',
            url: 'https://mostaql.com/project/1',
            platformId: 'mostaql',
        };
        const { createBackgroundApp } =
            await import('../../../../src/app/background/create-background-services');
        createBackgroundApp();

        await getRuntimeDeps().runPolling('manual-check');
        expect(factoryMocks.state.runPollingCycle).toHaveBeenCalledWith(
            expect.objectContaining({
                storage: factoryMocks.state.storage,
                reason: 'manual-check',
                monitoring: factoryMocks.state.monitoring,
            })
        );

        const pollingOptions = getBatchOptions(factoryMocks.state.runPollingCycle);
        await pollingOptions.notifyJobs([job]);
        await pollingOptions.playNotificationSound?.();
        expect(factoryMocks.state.notifications.showJobsNotification).toHaveBeenCalledWith([job]);
        expect(factoryMocks.state.audio.playNotification).toHaveBeenCalledOnce();

        await factoryMocks.state.signalROptions?.onJobsReceived([job]);
        expect(factoryMocks.state.processRealtimeJobBatch).toHaveBeenCalledWith(
            expect.objectContaining({
                jobs: [job],
                storage: factoryMocks.state.storage,
            })
        );
        const realtimeOptions = getBatchOptions(factoryMocks.state.processRealtimeJobBatch);
        await realtimeOptions.notifyJobs([job]);
        await realtimeOptions.playNotificationSound?.();
        expect(factoryMocks.state.notifications.showJobsNotification).toHaveBeenCalledWith([job]);
        expect(factoryMocks.state.audio.playNotification).toHaveBeenCalledTimes(2);

        await factoryMocks.state.signalROptions?.onPollingFallback('signalr-fallback');
        expect(factoryMocks.state.runPollingCycle).toHaveBeenLastCalledWith(
            expect.objectContaining({
                reason: 'signalr-fallback',
            })
        );
    });
});
