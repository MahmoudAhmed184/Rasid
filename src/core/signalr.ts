import {
    HubConnection,
    HubConnectionBuilder,
    HttpTransportType,
    LogLevel,
} from '@microsoft/signalr';
import { browser } from 'wxt/browser';

import {
    ALARM_NAMES,
    DEFAULT_SIGNALR_URL,
    SIGNALR_HEALTH_INTERVAL_MINUTES,
    SIGNALR_LEASE_WINDOW_MINUTES,
    SIGNALR_LEASE_WINDOW_MS,
    SIGNALR_RECONNECT_DELAY_MINUTES,
    clampPollingInterval,
    type ExtensionSettings,
    type JobRecord,
    type SignalRState,
    type SignalRStatus,
} from '../models/extension';
import { normalizeJobRecord } from './jobs';
import type { ExtensionStorage } from './storage';

interface SignalRJobEnvelope {
    jobs?: unknown[];
}

interface SignalRManagerOptions {
    storage: ExtensionStorage;
    onJobsReceived: (jobs: JobRecord[]) => Promise<void>;
    onPollingFallback: (reason: string) => Promise<void>;
    logger?: Pick<Console, 'info' | 'warn' | 'error'>;
    now?: () => Date;
}

export interface SignalRManager {
    bootstrap(reason?: string): Promise<void>;
    handleAlarm(alarm: Browser.alarms.Alarm): Promise<boolean>;
    reconnect(reason?: string): Promise<void>;
    disconnect(reason?: string): Promise<void>;
}

type DesiredTransport = 'disabled' | 'polling' | 'signalr';

const LIVE_SIGNALR_STATUSES = new Set<SignalRStatus>(['connecting', 'connected']);
const MAX_RECONNECT_DELAY_MINUTES = 15;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isDue(dateText: string | null, nowValue: Date): boolean {
    if (!dateText) {
        return true;
    }

    const scheduledTime = Date.parse(dateText);
    return Number.isNaN(scheduledTime) || scheduledTime <= nowValue.getTime();
}

function resolveDesiredTransport(settings: ExtensionSettings): DesiredTransport {
    if (settings.systemEnabled === false) {
        return 'disabled';
    }

    if (settings.notificationMode === 'polling') {
        return 'polling';
    }

    return 'signalr';
}

function computeReconnectDelayMinutes(attempt: number): number {
    const boundedAttempt = Math.max(0, attempt);
    const exponentialDelay = SIGNALR_RECONNECT_DELAY_MINUTES * 2 ** Math.max(boundedAttempt - 1, 0);
    return Math.min(Math.max(exponentialDelay, SIGNALR_RECONNECT_DELAY_MINUTES), MAX_RECONNECT_DELAY_MINUTES);
}

export function createSignalRManager(options: SignalRManagerOptions): SignalRManager {
    const logger = options.logger ?? console;
    const now = options.now ?? (() => new Date());
    const workerInstanceId = crypto.randomUUID();

    let connection: HubConnection | null = null;
    let connectPromise: Promise<void> | null = null;
    let bootstrapPromise: Promise<void> | null = null;
    let connectionRevision = 0;
    const intentionallyClosing = new WeakSet<HubConnection>();

    async function syncRecurringAlarms(settings: ExtensionSettings): Promise<DesiredTransport> {
        const desiredTransport = resolveDesiredTransport(settings);

        if (desiredTransport === 'disabled') {
            await browser.alarms.clear(ALARM_NAMES.jobPolling);
            await browser.alarms.clear(ALARM_NAMES.signalrHealth);
            await browser.alarms.clear(ALARM_NAMES.signalrLease);
            await browser.alarms.clear(ALARM_NAMES.signalrReconnect);
            return desiredTransport;
        }

        // The polling alarm is always present when monitoring is enabled so the worker
        // can continue making progress even if the live socket dies with the worker.
        await browser.alarms.create(ALARM_NAMES.jobPolling, {
            periodInMinutes: clampPollingInterval(settings.interval),
        });

        if (desiredTransport === 'polling') {
            await browser.alarms.clear(ALARM_NAMES.signalrHealth);
            await browser.alarms.clear(ALARM_NAMES.signalrLease);
            await browser.alarms.clear(ALARM_NAMES.signalrReconnect);
            return desiredTransport;
        }

        await browser.alarms.create(ALARM_NAMES.signalrHealth, {
            periodInMinutes: SIGNALR_HEALTH_INTERVAL_MINUTES,
        });

        return desiredTransport;
    }

    async function setPassiveState(reason: string, patch: Partial<SignalRState>): Promise<void> {
        await options.storage.setSignalRState({
            instanceId: null,
            connectionId: null,
            leaseExpiresAt: null,
            lastDisconnectedAt: now().toISOString(),
            lastDisconnectReason: reason,
            ...patch,
        });
    }

    async function stopConnection(reason: string, patch: Partial<SignalRState> = {}): Promise<void> {
        const activeConnection = connection;
        connection = null;
        connectionRevision += 1;

        if (activeConnection) {
            intentionallyClosing.add(activeConnection);

            try {
                await activeConnection.stop();
            } catch (error) {
                logger.warn('SignalR stop failed:', error);
            } finally {
                intentionallyClosing.delete(activeConnection);
            }
        }

        await browser.alarms.clear(ALARM_NAMES.signalrLease);
        await setPassiveState(reason, patch);
    }

    async function markConnected(serverUrl: string): Promise<void> {
        const connectedAt = now().toISOString();
        const leaseExpiresAt = new Date(now().getTime() + SIGNALR_LEASE_WINDOW_MS).toISOString();

        await browser.alarms.clear(ALARM_NAMES.signalrReconnect);
        await browser.alarms.create(ALARM_NAMES.signalrLease, {
            delayInMinutes: SIGNALR_LEASE_WINDOW_MINUTES,
        });

        await options.storage.setSignalRState({
            status: 'connected',
            instanceId: workerInstanceId,
            connectionId: connection?.connectionId ?? null,
            serverUrl,
            isFallbackActive: false,
            reconnectAttempt: 0,
            lastConnectedAt: connectedAt,
            lastEventAt: connectedAt,
            nextReconnectAt: null,
            leaseExpiresAt,
            lastDisconnectReason: null,
        });
    }

    async function refreshLeaseFromEvent(serverUrl: string): Promise<void> {
        await browser.alarms.create(ALARM_NAMES.signalrLease, {
            delayInMinutes: SIGNALR_LEASE_WINDOW_MINUTES,
        });

        await options.storage.setSignalRState({
            status: 'connected',
            instanceId: workerInstanceId,
            connectionId: connection?.connectionId ?? null,
            serverUrl,
            isFallbackActive: false,
            lastEventAt: now().toISOString(),
            leaseExpiresAt: new Date(now().getTime() + SIGNALR_LEASE_WINDOW_MS).toISOString(),
        });
    }

    async function scheduleReconnect(
        reason: string,
        config: {
            attempt?: number;
            delayMinutes?: number;
            status?: Extract<SignalRStatus, 'polling' | 'backoff'>;
        } = {}
    ): Promise<void> {
        const settings = await options.storage.getSettings();

        if (resolveDesiredTransport(settings) !== 'signalr') {
            return;
        }

        const runtime = await options.storage.getRuntimeState();
        const attempt =
            typeof config.attempt === 'number'
                ? Math.max(0, config.attempt)
                : runtime.signalr.reconnectAttempt + 1;
        const delayMinutes = config.delayMinutes ?? computeReconnectDelayMinutes(attempt);
        const nextReconnectAt = new Date(now().getTime() + delayMinutes * 60 * 1000).toISOString();

        await browser.alarms.create(ALARM_NAMES.signalrReconnect, {
            delayInMinutes: delayMinutes,
        });

        await setPassiveState(reason, {
            status: config.status ?? 'backoff',
            isFallbackActive: true,
            reconnectAttempt: attempt,
            nextReconnectAt,
            serverUrl: runtime.signalr.serverUrl || DEFAULT_SIGNALR_URL,
        });
    }

    async function healSuspendedLiveSession(reason: string): Promise<string | null> {
        const runtime = await options.storage.getRuntimeState();
        const signalr = runtime.signalr;
        const currentTime = now();
        const leaseExpired =
            signalr.leaseExpiresAt !== null && Date.parse(signalr.leaseExpiresAt) <= currentTime.getTime();
        const staleWorkerOwnedLiveSession =
            signalr.instanceId !== null &&
            signalr.instanceId !== workerInstanceId &&
            LIVE_SIGNALR_STATUSES.has(signalr.status);

        if (!leaseExpired && !staleWorkerOwnedLiveSession) {
            return null;
        }

        const disconnectReason = leaseExpired
            ? 'signalr-lease-expired'
            : `signalr-worker-rotated:${reason}`;

        await browser.alarms.clear(ALARM_NAMES.signalrLease);
        await setPassiveState(disconnectReason, {
            status: 'suspended',
            isFallbackActive: true,
            nextReconnectAt: signalr.nextReconnectAt,
            reconnectAttempt: signalr.reconnectAttempt,
            serverUrl: signalr.serverUrl || DEFAULT_SIGNALR_URL,
        });

        return disconnectReason;
    }

    function normalizeEnvelope(payload: unknown): JobRecord[] {
        const envelope = payload as SignalRJobEnvelope;
        const rawJobs = Array.isArray(envelope?.jobs)
            ? envelope.jobs
            : Array.isArray(payload)
              ? payload
              : [];

        return rawJobs
            .map((job) => normalizeJobRecord(job))
            .filter((job): job is JobRecord => Boolean(job));
    }

    async function handleInboundJobs(
        boundConnection: HubConnection,
        serverUrl: string,
        payload: unknown
    ): Promise<void> {
        if (connection !== boundConnection) {
            return;
        }

        const jobs = normalizeEnvelope(payload);

        if (jobs.length === 0) {
            return;
        }

        await refreshLeaseFromEvent(serverUrl);

        try {
            await options.onJobsReceived(jobs);
        } catch (error) {
            logger.error('SignalR job processing failed:', error);
        }
    }

    async function handleUnexpectedClose(serverUrl: string, error: unknown): Promise<void> {
        const reason = `signalr-closed:${errorMessage(error)}`;
        connection = null;

        await browser.alarms.clear(ALARM_NAMES.signalrLease);
        await scheduleReconnect(reason);
        await options.onPollingFallback(reason);

        logger.warn('SignalR connection closed, polling fallback enabled:', reason, serverUrl);
    }

    function bindHandlers(boundConnection: HubConnection, serverUrl: string): void {
        boundConnection.on('NewJobsDetected', (payload: unknown) => {
            void handleInboundJobs(boundConnection, serverUrl, payload);
        });

        boundConnection.onclose((error) => {
            if (intentionallyClosing.has(boundConnection)) {
                return;
            }

            if (connection !== boundConnection) {
                return;
            }

            void handleUnexpectedClose(serverUrl, error);
        });
    }

    async function connectLiveTransport(reason: string): Promise<void> {
        const settings = await options.storage.getSettings();

        if (resolveDesiredTransport(settings) !== 'signalr') {
            return;
        }

        const runtime = await options.storage.getRuntimeState();

        if (!reason.startsWith('manual') && !isDue(runtime.signalr.nextReconnectAt, now())) {
            return;
        }

        if (connection) {
            return;
        }

        if (connectPromise) {
            return connectPromise;
        }

        const serverUrl = settings.signalrServerUrl || DEFAULT_SIGNALR_URL;
        const revision = connectionRevision + 1;

        connectPromise = (async () => {
            connectionRevision = revision;

            const nextConnection = new HubConnectionBuilder()
                // MV3 workers are suspendable, so reconnect policy must be alarm-driven
                // instead of relying on in-memory SignalR backoff timers.
                .withUrl(serverUrl, {
                    skipNegotiation: false,
                    transport:
                        HttpTransportType.WebSockets |
                        HttpTransportType.ServerSentEvents |
                        HttpTransportType.LongPolling,
                })
                .configureLogging(LogLevel.Warning)
                .build();

            nextConnection.serverTimeoutInMilliseconds = 120000;
            nextConnection.keepAliveIntervalInMilliseconds = 15000;

            bindHandlers(nextConnection, serverUrl);

            await options.storage.setSignalRState({
                status: 'connecting',
                instanceId: workerInstanceId,
                connectionId: null,
                serverUrl,
                isFallbackActive: false,
                nextReconnectAt: null,
                lastDisconnectReason: null,
            });

            try {
                await nextConnection.start();

                // A newer revision won ownership while this socket was connecting.
                if (revision !== connectionRevision) {
                    intentionallyClosing.add(nextConnection);

                    try {
                        await nextConnection.stop();
                    } finally {
                        intentionallyClosing.delete(nextConnection);
                    }

                    return;
                }

                connection = nextConnection;
                await markConnected(serverUrl);
                logger.info('SignalR connected:', reason, serverUrl);
            } catch (error) {
                if (revision === connectionRevision) {
                    connection = null;
                    await scheduleReconnect(`signalr-connect-failed:${errorMessage(error)}`);
                    await options.onPollingFallback('signalr-connect-failed');
                }

                logger.warn('SignalR connect failed, polling fallback enabled:', error);

                try {
                    intentionallyClosing.add(nextConnection);
                    await nextConnection.stop();
                } catch {
                    // Ignore stop failures after a failed connect attempt.
                } finally {
                    intentionallyClosing.delete(nextConnection);
                }
            } finally {
                connectPromise = null;
            }
        })();

        return connectPromise;
    }

    async function ensureDisabledState(reason: string): Promise<void> {
        await stopConnection(reason, {
            status: 'idle',
            isFallbackActive: false,
            reconnectAttempt: 0,
            nextReconnectAt: null,
        });
    }

    async function ensurePollingMode(reason: string): Promise<void> {
        await stopConnection(reason, {
            status: 'polling',
            isFallbackActive: true,
            reconnectAttempt: 0,
            nextReconnectAt: null,
        });
    }

    async function bootstrap(reason = 'worker-start'): Promise<void> {
        if (!bootstrapPromise) {
            bootstrapPromise = (async () => {
                await options.storage.ensureDefaults();

                const settings = await options.storage.getSettings();
                const desiredTransport = await syncRecurringAlarms(settings);

                if (desiredTransport === 'disabled') {
                    await ensureDisabledState('system-disabled');
                    return;
                }

                if (desiredTransport === 'polling') {
                    await ensurePollingMode('polling-mode-configured');
                    return;
                }

                const healingReason = await healSuspendedLiveSession(reason);

                if (healingReason) {
                    await options.onPollingFallback(healingReason);
                }

                await connectLiveTransport(reason);
            })().finally(() => {
                bootstrapPromise = null;
            });
        }

        return bootstrapPromise;
    }

    async function handleJobPollingAlarm(): Promise<void> {
        const snapshot = await options.storage.getSnapshot();
        const desiredTransport = resolveDesiredTransport(snapshot.settings);

        if (desiredTransport === 'disabled') {
            return;
        }

        if (desiredTransport === 'polling' || snapshot.runtime.signalr.isFallbackActive) {
            await options.onPollingFallback('jobs-poll-alarm');
            return;
        }

        if (!connection) {
            await options.onPollingFallback('jobs-poll-no-live-connection');
            await connectLiveTransport('jobs-poll-alarm');
        }
    }

    async function handleHealthAlarm(): Promise<void> {
        const snapshot = await options.storage.getSnapshot();

        if (resolveDesiredTransport(snapshot.settings) !== 'signalr') {
            return;
        }

        const leaseExpired =
            snapshot.runtime.signalr.leaseExpiresAt !== null &&
            Date.parse(snapshot.runtime.signalr.leaseExpiresAt) <= now().getTime();

        if (leaseExpired) {
            await stopConnection('signalr-health-lease-expired', {
                status: 'polling',
                isFallbackActive: true,
            });
            await options.onPollingFallback('signalr-health-lease-expired');
            await scheduleReconnect('signalr-health-lease-expired', {
                attempt: 0,
                delayMinutes: SIGNALR_RECONNECT_DELAY_MINUTES,
                status: 'polling',
            });
            return;
        }

        if (!connection) {
            await setPassiveState('signalr-health-no-connection', {
                status: 'suspended',
                isFallbackActive: true,
            });
            await options.onPollingFallback('signalr-health-no-connection');
            await connectLiveTransport('signalr-health-alarm');
        }
    }

    async function handleLeaseAlarm(): Promise<void> {
        const settings = await options.storage.getSettings();

        if (resolveDesiredTransport(settings) !== 'signalr') {
            return;
        }

        // Rotate out of the live socket before the browser has a chance to cull the
        // worker, then let the standard polling alarm carry the extension briefly.
        await stopConnection('signalr-lease-window-ended', {
            status: 'polling',
            isFallbackActive: true,
        });
        await options.onPollingFallback('signalr-lease-window-ended');
        await scheduleReconnect('signalr-lease-window-ended', {
            attempt: 0,
            delayMinutes: SIGNALR_RECONNECT_DELAY_MINUTES,
            status: 'polling',
        });
    }

    async function handleAlarm(alarm: Browser.alarms.Alarm): Promise<boolean> {
        await bootstrap(`alarm:${alarm.name}`);

        switch (alarm.name) {
            case ALARM_NAMES.jobPolling:
                await handleJobPollingAlarm();
                return true;
            case ALARM_NAMES.signalrHealth:
                await handleHealthAlarm();
                return true;
            case ALARM_NAMES.signalrLease:
                await handleLeaseAlarm();
                return true;
            case ALARM_NAMES.signalrReconnect:
                await connectLiveTransport('signalr-reconnect-alarm');
                return true;
            default:
                return false;
        }
    }

    async function reconnect(reason = 'manual-reconnect'): Promise<void> {
        await stopConnection(reason, {
            status: 'idle',
            isFallbackActive: false,
            reconnectAttempt: 0,
            nextReconnectAt: null,
        });
        await browser.alarms.clear(ALARM_NAMES.signalrReconnect);
        await connectLiveTransport(reason);
    }

    async function disconnect(reason = 'manual-disconnect'): Promise<void> {
        await stopConnection(reason, {
            status: 'polling',
            isFallbackActive: true,
            reconnectAttempt: 0,
            nextReconnectAt: null,
        });
        await browser.alarms.clear(ALARM_NAMES.signalrReconnect);
    }

    return {
        bootstrap,
        handleAlarm,
        reconnect,
        disconnect,
    };
}
