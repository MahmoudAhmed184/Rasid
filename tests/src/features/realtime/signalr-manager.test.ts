import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';
import type { SignalRState } from '../../../../src/entities/runtime/model';
import { DEFAULT_SIGNALR_URL } from '../../../../src/entities/runtime/signalr';
import type { ExtensionSettings } from '../../../../src/entities/settings/model';
import { createSignalRManager } from '../../../../src/features/realtime/signalr-manager';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';
import {
    DEFAULT_RUNTIME_STATE,
    DEFAULT_SETTINGS,
    type StoredState,
} from '../../../../src/shared/storage/schema';

type SignalRHandler = (payload: unknown) => void;
type CloseHandler = (error?: Error) => void;

interface FakeConnection {
    connectionId: string | null;
    handlers: Record<string, SignalRHandler>;
    closeHandler: CloseHandler | null;
    start: ReturnType<typeof vi.fn<() => Promise<void>>>;
    stop: ReturnType<typeof vi.fn<() => Promise<void>>>;
    on(eventName: string, handler: SignalRHandler): void;
    onclose(handler: CloseHandler): void;
    serverTimeoutInMilliseconds: number;
    keepAliveIntervalInMilliseconds: number;
}

const signalrMock = vi.hoisted(() => {
    const connections: FakeConnection[] = [];
    const builders: Array<{
        withUrl: ReturnType<typeof vi.fn>;
        configureLogging: ReturnType<typeof vi.fn>;
        build: ReturnType<typeof vi.fn>;
    }> = [];
    const state = {
        startError: null as Error | null,
    };

    function createConnection(): FakeConnection {
        const connection: FakeConnection = {
            connectionId: 'connection-1',
            handlers: {},
            closeHandler: null,
            start: vi.fn(async () => {
                if (state.startError) {
                    throw state.startError;
                }
            }),
            stop: vi.fn(async () => undefined),
            on(eventName, handler) {
                connection.handlers[eventName] = handler;
            },
            onclose(handler) {
                connection.closeHandler = handler;
            },
            serverTimeoutInMilliseconds: 0,
            keepAliveIntervalInMilliseconds: 0,
        };
        connections.push(connection);
        return connection;
    }

    function createBuilder() {
        const builder = {
            withUrl: vi.fn(() => builder),
            configureLogging: vi.fn(() => builder),
            build: vi.fn(() => createConnection()),
        };
        builders.push(builder);
        return builder;
    }

    return {
        builders,
        connections,
        state,
        HubConnectionBuilder: vi.fn(function () {
            return createBuilder();
        }),
        HttpTransportType: {
            WebSockets: 1,
            ServerSentEvents: 2,
            LongPolling: 4,
        },
        LogLevel: {
            Warning: 2,
        },
        HubConnection: class {},
    };
});

vi.mock('@microsoft/signalr', () => signalrMock);

function createSnapshot(
    settings: ExtensionSettings,
    signalr: SignalRState = DEFAULT_RUNTIME_STATE.signalr
): StoredState {
    return {
        settings,
        seenJobs: [],
        recentJobs: [],
        stats: {
            lastCheck: null,
            todayCount: 0,
            todayDate: new Date().toDateString(),
        },
        trackedProjects: {},
        prompts: [],
        proposalTemplate: '',
        notificationsEnabled: true,
        runtime: {
            ...DEFAULT_RUNTIME_STATE,
            signalr,
        },
    };
}

function createStorage(
    settings: ExtensionSettings,
    initialSignalR = DEFAULT_RUNTIME_STATE.signalr
) {
    let signalr = initialSignalR;
    const storage = {
        ensureDefaults: vi.fn(async () => createSnapshot(settings, signalr)),
        getSettings: vi.fn(async () => settings),
        getRuntimeState: vi.fn(async () => ({
            ...DEFAULT_RUNTIME_STATE,
            signalr,
        })),
        getSnapshot: vi.fn(async () => createSnapshot(settings, signalr)),
        setSignalRState: vi.fn(async (next: SignalRState) => {
            signalr = next;
            return signalr;
        }),
    } satisfies Pick<
        ExtensionStorage,
        'ensureDefaults' | 'getSettings' | 'getRuntimeState' | 'getSnapshot' | 'setSignalRState'
    >;

    return storage;
}

describe('SignalR manager', () => {
    beforeEach(() => {
        signalrMock.builders.length = 0;
        signalrMock.connections.length = 0;
        signalrMock.state.startError = null;
        signalrMock.HubConnectionBuilder.mockClear();
    });

    it('bootstraps disabled and polling modes without creating live connections', async () => {
        const disabledStorage = createStorage({
            ...DEFAULT_SETTINGS,
            systemEnabled: false,
        });
        const disabled = createSignalRManager({
            storage: disabledStorage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback: async () => undefined,
        });

        await disabled.bootstrap('test');
        expect(signalrMock.HubConnectionBuilder).not.toHaveBeenCalled();
        expect(disabledStorage.setSignalRState).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: 'idle',
                lastDisconnectReason: 'system-disabled',
            })
        );

        const pollingStorage = createStorage({
            ...DEFAULT_SETTINGS,
            notificationMode: 'polling',
        });
        const polling = createSignalRManager({
            storage: pollingStorage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback: async () => undefined,
        });

        await polling.bootstrap('test');
        expect(pollingStorage.setSignalRState).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: 'polling',
                lastDisconnectReason: 'polling-mode-configured',
            })
        );
    });

    it('connects live transport and processes normalized inbound jobs', async () => {
        vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
        const storage = createStorage(DEFAULT_SETTINGS);
        const onJobsReceived = vi.fn(async (_jobs: JobRecord[]) => undefined);
        const onPollingFallback = vi.fn(async () => undefined);
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived,
            onPollingFallback,
            logger,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await manager.bootstrap('worker-start');

        const builder = signalrMock.builders.at(-1);
        const connection = signalrMock.connections.at(-1);
        expect(builder?.withUrl).toHaveBeenCalledWith(
            DEFAULT_SIGNALR_URL,
            expect.objectContaining({
                skipNegotiation: false,
                transport: 7,
            })
        );
        expect(connection?.start).toHaveBeenCalledOnce();
        expect(storage.setSignalRState.mock.calls.map(([state]) => state.status)).toEqual([
            'connecting',
            'connected',
        ]);
        expect(logger.info).toHaveBeenCalledWith(
            'SignalR connected:',
            'worker-start',
            DEFAULT_SIGNALR_URL
        );

        connection?.handlers.NewJobsDetected?.({
            jobs: [
                {
                    id: '1',
                    platformId: 'mostaql',
                    title: 'مشروع جديد',
                    url: 'https://mostaql.com/project/1',
                },
                {
                    id: '',
                    title: '',
                    url: 'not-a-job',
                },
            ],
        });

        await vi.waitFor(() =>
            expect(onJobsReceived).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: '1',
                    platformId: 'mostaql',
                }),
            ])
        );
        expect(onPollingFallback).not.toHaveBeenCalled();
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'connected',
            lastEventAt: '2026-05-22T12:00:00.000Z',
        });
    });

    it('normalizes array job envelopes, ignores empty payloads, and logs processing failures', async () => {
        const storage = createStorage(DEFAULT_SETTINGS);
        const onJobsReceived = vi.fn(async (_jobs: JobRecord[]) => {
            throw new Error('processor failed');
        });
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived,
            onPollingFallback: async () => undefined,
            logger,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await manager.bootstrap('worker-start');

        const connection = signalrMock.connections.at(-1);
        connection?.handlers.NewJobsDetected?.([
            {
                id: '2',
                platformId: 'khamsat',
                title: 'خدمة جديدة',
                url: 'https://khamsat.com/service/2',
            },
        ]);

        await vi.waitFor(() =>
            expect(logger.error).toHaveBeenCalledWith(
                'SignalR job processing failed:',
                expect.any(Error)
            )
        );
        expect(onJobsReceived).toHaveBeenCalledWith([
            expect.objectContaining({
                id: '2',
                platformId: 'khamsat',
            }),
        ]);

        connection?.handlers.NewJobsDetected?.({ jobs: [] });
        connection?.handlers.NewJobsDetected?.({ jobs: [{ title: '', url: '' }] });
        await Promise.resolve();

        expect(onJobsReceived).toHaveBeenCalledOnce();
    });

    it('falls back to polling and schedules reconnect when the live connection fails to start', async () => {
        signalrMock.state.startError = new Error('connect failed');
        const storage = createStorage(DEFAULT_SETTINGS);
        const onPollingFallback = vi.fn(async () => undefined);
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback,
            logger,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await manager.bootstrap('worker-start');

        const connection = signalrMock.connections.at(-1);
        expect(connection?.start).toHaveBeenCalledOnce();
        expect(connection?.stop).toHaveBeenCalledOnce();
        expect(onPollingFallback).toHaveBeenCalledWith('signalr-connect-failed');
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'backoff',
            lastDisconnectReason: 'signalr-connect-failed',
            reconnectAttempt: 1,
            nextReconnectAt: '2026-05-22T12:01:00.000Z',
        });
        expect(logger.warn).toHaveBeenCalledWith(
            'SignalR connect failed, polling fallback enabled:',
            DEFAULT_SIGNALR_URL,
            'Error'
        );
    });

    it('defers non-manual reconnect attempts until their scheduled time but allows manual reconnect', async () => {
        const storage = createStorage(DEFAULT_SETTINGS, {
            status: 'backoff',
            instanceId: null,
            connectionId: null,
            serverUrl: DEFAULT_SIGNALR_URL,
            reconnectAttempt: 2,
            lastConnectedAt: null,
            lastDisconnectedAt: '2026-05-22T11:59:00.000Z',
            lastDisconnectReason: 'signalr-connect-failed',
            lastEventAt: null,
            nextReconnectAt: '2026-05-22T12:10:00.000Z',
            leaseExpiresAt: null,
        });
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback: async () => undefined,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await manager.bootstrap('worker-start');
        expect(signalrMock.HubConnectionBuilder).not.toHaveBeenCalled();

        await manager.reconnect('manual-retry');
        expect(signalrMock.HubConnectionBuilder).toHaveBeenCalledOnce();
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'connected',
            reconnectAttempt: 0,
        });
    });

    it('runs polling fallback for job and health alarms when SignalR is already in backoff', async () => {
        const storage = createStorage(DEFAULT_SETTINGS, {
            status: 'backoff',
            instanceId: null,
            connectionId: null,
            serverUrl: DEFAULT_SIGNALR_URL,
            reconnectAttempt: 3,
            lastConnectedAt: '2026-05-22T11:30:00.000Z',
            lastDisconnectedAt: '2026-05-22T11:59:00.000Z',
            lastDisconnectReason: 'signalr-closed',
            lastEventAt: '2026-05-22T11:30:00.000Z',
            nextReconnectAt: '2026-05-22T12:10:00.000Z',
            leaseExpiresAt: null,
        });
        const onPollingFallback = vi.fn(async () => undefined);
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await expect(
            manager.handleAlarm({ name: 'jobs:poll', scheduledTime: Date.now() })
        ).resolves.toBe(true);
        expect(onPollingFallback).toHaveBeenCalledWith('jobs-poll-alarm');
        expect(signalrMock.HubConnectionBuilder).not.toHaveBeenCalled();

        await expect(
            manager.handleAlarm({ name: 'signalr:health', scheduledTime: Date.now() })
        ).resolves.toBe(true);
        expect(onPollingFallback).toHaveBeenCalledWith('signalr-health-no-connection');
        expect(storage.setSignalRState.mock.calls.map(([state]) => state.status)).toContain(
            'suspended'
        );
        expect(
            storage.setSignalRState.mock.calls.some(([state]) => {
                return (
                    state.status === 'suspended' &&
                    state.lastDisconnectReason === 'signalr-health-no-connection'
                );
            })
        ).toBe(true);
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'connected',
        });
    });

    it('heals expired live leases on bootstrap before taking over the live transport', async () => {
        const storage = createStorage(DEFAULT_SETTINGS, {
            status: 'connected',
            instanceId: 'stale-worker',
            connectionId: 'stale-connection',
            serverUrl: DEFAULT_SIGNALR_URL,
            reconnectAttempt: 0,
            lastConnectedAt: '2026-05-22T11:00:00.000Z',
            lastDisconnectedAt: null,
            lastDisconnectReason: null,
            lastEventAt: '2026-05-22T11:30:00.000Z',
            nextReconnectAt: null,
            leaseExpiresAt: '2026-05-22T11:59:00.000Z',
        });
        const onPollingFallback = vi.fn(async () => undefined);
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await manager.bootstrap('worker-start');

        expect(onPollingFallback).toHaveBeenCalledWith('signalr-lease-expired');
        expect(storage.setSignalRState.mock.calls.map(([state]) => state.status)).toContain(
            'suspended'
        );
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'connected',
            connectionId: 'connection-1',
        });
    });

    it('handles unexpected connection close with polling fallback and redacted error logging', async () => {
        const storage = createStorage({
            ...DEFAULT_SETTINGS,
            signalrServerUrl: 'https://signalr.example/hub?access_token=secret',
        });
        const onPollingFallback = vi.fn(async () => undefined);
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback,
            logger,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await manager.bootstrap('worker-start');
        signalrMock.connections.at(-1)?.closeHandler?.(new Error('socket closed'));

        await vi.waitFor(() => {
            expect(onPollingFallback).toHaveBeenCalledWith('signalr-closed');
        });
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'backoff',
            lastDisconnectReason: 'signalr-closed',
        });
        expect(logger.warn).toHaveBeenCalledWith(
            'SignalR connection closed, polling fallback enabled:',
            'signalr-closed',
            DEFAULT_SIGNALR_URL,
            'Error'
        );
    });

    it('logs stop failures during manual disconnect while still entering polling mode', async () => {
        const storage = createStorage(DEFAULT_SETTINGS);
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback: async () => undefined,
            logger,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await manager.bootstrap('worker-start');

        const connection = signalrMock.connections.at(-1);
        connection?.stop.mockRejectedValueOnce(new Error('stop failed'));

        await manager.disconnect('manual-stop-failure');

        expect(logger.warn).toHaveBeenCalledWith('SignalR stop failed:', expect.any(Error));
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'polling',
            lastDisconnectReason: 'manual-stop-failure',
        });
    });

    it('disconnects, reconnects manually, and ignores stale connection close callbacks', async () => {
        const storage = createStorage(DEFAULT_SETTINGS);
        const onPollingFallback = vi.fn(async () => undefined);
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await manager.bootstrap('worker-start');
        const firstConnection = signalrMock.connections.at(-1);

        await manager.disconnect();

        expect(firstConnection?.stop).toHaveBeenCalledOnce();
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'polling',
            lastDisconnectReason: 'manual-disconnect',
        });

        firstConnection?.closeHandler?.(new Error('ignored close'));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onPollingFallback).not.toHaveBeenCalledWith('signalr-closed');

        await manager.reconnect();

        expect(signalrMock.connections).toHaveLength(2);
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'connected',
        });
    });

    it('handles polling, lease, reconnect, and unknown alarms deterministically', async () => {
        const storage = createStorage(DEFAULT_SETTINGS);
        const onPollingFallback = vi.fn(async () => undefined);
        const manager = createSignalRManager({
            storage: storage as unknown as ExtensionStorage,
            onJobsReceived: async () => undefined,
            onPollingFallback,
            now: () => new Date('2026-05-22T12:00:00.000Z'),
        });

        await manager.bootstrap('worker-start');
        const liveConnection = signalrMock.connections.at(-1);

        await expect(
            manager.handleAlarm({ name: 'jobs:poll', scheduledTime: Date.now() })
        ).resolves.toBe(true);
        expect(onPollingFallback).not.toHaveBeenCalledWith('jobs-poll-no-live-connection');

        await expect(
            manager.handleAlarm({ name: 'signalr:lease', scheduledTime: Date.now() })
        ).resolves.toBe(true);
        expect(liveConnection?.stop).toHaveBeenCalledOnce();
        expect(onPollingFallback).toHaveBeenCalledWith('signalr-lease-window-ended');
        expect(storage.setSignalRState.mock.calls.at(-1)?.[0]).toMatchObject({
            status: 'polling',
            lastDisconnectReason: 'signalr-lease-window-ended',
        });

        await expect(
            manager.handleAlarm({ name: 'signalr:reconnect', scheduledTime: Date.now() })
        ).resolves.toBe(true);
        expect(signalrMock.connections).toHaveLength(1);

        await expect(
            manager.handleAlarm({ name: 'unknown-alarm', scheduledTime: Date.now() })
        ).resolves.toBe(false);
    });
});
