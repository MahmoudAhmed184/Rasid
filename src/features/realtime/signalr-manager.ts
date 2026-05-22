import {
    HubConnection,
    HubConnectionBuilder,
    HttpTransportType,
    LogLevel,
} from '@microsoft/signalr';

import { ALARM_NAMES, SIGNALR_LEASE_WINDOW_MS, SIGNALR_RECONNECT_DELAY_MINUTES } from './constants';
import { redactSignalRUrl, resolveSignalRServerUrl } from '../../entities/runtime/signalr';
import { createRecurringSignalREffects, executeSignalREffects } from './signalr-effects';
import {
    computeReconnectDelayMinutes,
    reduceSignalRState,
    resolveDesiredTransport,
    type DesiredTransport,
    type ReconnectSignalRStatus,
    type SignalREvent,
} from './signalr-reducer';
import { normalizeJobRecord } from '../../features/monitoring/job-records';
import type { JobRecord } from '../../entities/job/model';
import type { SignalRState } from '../../entities/runtime/model';
import { isSignalRFallbackState, isSignalRLiveState } from '../../entities/runtime/model';
import type { ExtensionSettings } from '../../entities/settings/model';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';

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

function safeErrorLabel(error: unknown): string {
    return error instanceof Error && error.name ? error.name : 'runtime-error';
}

function isDue(dateText: string | null, nowValue: Date): boolean {
    if (!dateText) {
        return true;
    }

    const scheduledTime = Date.parse(dateText);
    return Number.isNaN(scheduledTime) || scheduledTime <= nowValue.getTime();
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

    async function applySignalRTransition(
        current: SignalRState,
        event: SignalREvent
    ): Promise<SignalRState> {
        const transition = reduceSignalRState(current, event, {
            nowIso: now().toISOString(),
            workerInstanceId,
        });

        await executeSignalREffects(transition.effects);
        await options.storage.setSignalRState(transition.state);

        return transition.state;
    }

    async function syncRecurringAlarms(settings: ExtensionSettings): Promise<DesiredTransport> {
        const desiredTransport = resolveDesiredTransport(settings);
        await executeSignalREffects(
            createRecurringSignalREffects(desiredTransport, settings.interval)
        );
        return desiredTransport;
    }

    async function stopConnection(
        event: Extract<SignalREvent, { type: 'ENTER_IDLE' | 'ENTER_POLLING' | 'ENTER_SUSPENDED' }>
    ): Promise<void> {
        const currentSignalR = (await options.storage.getRuntimeState()).signalr;
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
        await applySignalRTransition(currentSignalR, event);
    }

    async function refreshLeaseFromEvent(serverUrl: string): Promise<void> {
        const currentSignalR = (await options.storage.getRuntimeState()).signalr;
        const eventTime = now();

        await applySignalRTransition(currentSignalR, {
            type: 'REFRESH_LEASE',
            serverUrl,
            connectionId: connection?.connectionId ?? null,
            eventAt: eventTime.toISOString(),
            leaseExpiresAt: new Date(eventTime.getTime() + SIGNALR_LEASE_WINDOW_MS).toISOString(),
        });
    }

    async function scheduleReconnect(
        reason: string,
        config: {
            attempt?: number;
            delayMinutes?: number;
            status?: ReconnectSignalRStatus;
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

        await applySignalRTransition(runtime.signalr, {
            type: 'SCHEDULE_RECONNECT',
            reason,
            attempt,
            nextReconnectAt,
            serverUrl: resolveSignalRServerUrl(runtime.signalr.serverUrl),
            status: config.status ?? 'backoff',
        });
    }

    async function healSuspendedLiveSession(reason: string): Promise<string | null> {
        const runtime = await options.storage.getRuntimeState();
        const signalr = runtime.signalr;
        const currentTime = now();
        const leaseExpired =
            signalr.leaseExpiresAt !== null &&
            Date.parse(signalr.leaseExpiresAt) <= currentTime.getTime();
        const staleWorkerOwnedLiveSession =
            signalr.instanceId !== null &&
            signalr.instanceId !== workerInstanceId &&
            isSignalRLiveState(signalr);

        if (!leaseExpired && !staleWorkerOwnedLiveSession) {
            return null;
        }

        const disconnectReason = leaseExpired
            ? 'signalr-lease-expired'
            : `signalr-worker-rotated:${reason}`;

        await applySignalRTransition(signalr, {
            type: 'ENTER_SUSPENDED',
            reason: disconnectReason,
            nextReconnectAt: signalr.nextReconnectAt,
            reconnectAttempt: signalr.reconnectAttempt,
            serverUrl: resolveSignalRServerUrl(signalr.serverUrl),
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
        const reason = 'signalr-closed';
        connection = null;

        await scheduleReconnect(reason);
        await options.onPollingFallback(reason);

        logger.warn(
            'SignalR connection closed, polling fallback enabled:',
            reason,
            redactSignalRUrl(serverUrl),
            safeErrorLabel(error)
        );
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

        const serverUrl = resolveSignalRServerUrl(settings.signalrServerUrl);
        const safeServerUrl = redactSignalRUrl(serverUrl);
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

            await applySignalRTransition(runtime.signalr, {
                type: 'ENTER_CONNECTING',
                serverUrl,
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
                const connectedAt = now();
                await applySignalRTransition((await options.storage.getRuntimeState()).signalr, {
                    type: 'ENTER_CONNECTED',
                    serverUrl,
                    connectionId: nextConnection.connectionId ?? null,
                    connectedAt: connectedAt.toISOString(),
                    leaseExpiresAt: new Date(
                        connectedAt.getTime() + SIGNALR_LEASE_WINDOW_MS
                    ).toISOString(),
                });
                logger.info('SignalR connected:', reason, safeServerUrl);
            } catch (error) {
                if (revision === connectionRevision) {
                    connection = null;
                    await scheduleReconnect('signalr-connect-failed');
                    await options.onPollingFallback('signalr-connect-failed');
                }

                logger.warn(
                    'SignalR connect failed, polling fallback enabled:',
                    safeServerUrl,
                    safeErrorLabel(error)
                );

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
        await stopConnection({ type: 'ENTER_IDLE', reason });
    }

    async function ensurePollingMode(reason: string): Promise<void> {
        await stopConnection({
            type: 'ENTER_POLLING',
            reason,
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

        if (desiredTransport === 'polling' || isSignalRFallbackState(snapshot.runtime.signalr)) {
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
            await stopConnection({
                type: 'ENTER_POLLING',
                reason: 'signalr-health-lease-expired',
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
            const currentSignalR = (await options.storage.getRuntimeState()).signalr;
            await applySignalRTransition(currentSignalR, {
                type: 'ENTER_SUSPENDED',
                reason: 'signalr-health-no-connection',
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
        await stopConnection({
            type: 'ENTER_POLLING',
            reason: 'signalr-lease-window-ended',
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
        await stopConnection({ type: 'ENTER_IDLE', reason });
        await connectLiveTransport(reason);
    }

    async function disconnect(reason = 'manual-disconnect'): Promise<void> {
        await stopConnection({
            type: 'ENTER_POLLING',
            reason,
            reconnectAttempt: 0,
            nextReconnectAt: null,
        });
    }

    return {
        bootstrap,
        handleAlarm,
        reconnect,
        disconnect,
    };
}
