import { DEFAULT_SIGNALR_URL } from '../../../features/realtime/constants';
import { DEFAULT_RUNTIME_STATE } from '../schema';
import type { StorageClient } from '../../browser/storage-client';
import { STORAGE_FIELDS } from '../storage-keys';
import type { RuntimeState, SignalRState, SignalRStatus } from '../../../entities/runtime/model';

const SIGNALR_STATUSES: ReadonlySet<SignalRStatus> = new Set([
    'idle',
    'connecting',
    'connected',
    'polling',
    'backoff',
    'suspended',
]);

export type RuntimeStatePatch = Partial<Omit<RuntimeState, 'signalr'>> & {
    signalr?: SignalRState;
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isSignalRStatus(value: unknown): value is SignalRStatus {
    return typeof value === 'string' && SIGNALR_STATUSES.has(value as SignalRStatus);
}

function normalizeNullableText(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeReconnectAttempt(value: unknown): number {
    return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function resolveLegacySignalRStatus(value: Record<string, unknown>): SignalRStatus {
    const status = isSignalRStatus(value.status)
        ? value.status
        : DEFAULT_RUNTIME_STATE.signalr.status;

    if (
        value.isFallbackActive === true &&
        (status === 'idle' || status === 'connecting' || status === 'connected')
    ) {
        return 'polling';
    }

    return status;
}

function createIdleSignalRState(input: {
    readonly serverUrl: string;
    readonly lastConnectedAt: string | null;
    readonly lastDisconnectedAt: string | null;
    readonly lastDisconnectReason: string | null;
    readonly lastEventAt: string | null;
}): SignalRState {
    return {
        status: 'idle',
        instanceId: null,
        connectionId: null,
        serverUrl: input.serverUrl,
        reconnectAttempt: 0,
        lastConnectedAt: input.lastConnectedAt,
        lastDisconnectedAt: input.lastDisconnectedAt,
        lastDisconnectReason: input.lastDisconnectReason,
        lastEventAt: input.lastEventAt,
        nextReconnectAt: null,
        leaseExpiresAt: null,
    };
}

export function normalizeSignalRState(value: unknown): SignalRState {
    if (!isObject(value)) {
        return { ...DEFAULT_RUNTIME_STATE.signalr };
    }

    const serverUrl =
        typeof value.serverUrl === 'string' && value.serverUrl.length > 0
            ? value.serverUrl
            : DEFAULT_SIGNALR_URL;
    const reconnectAttempt = normalizeReconnectAttempt(value.reconnectAttempt);
    const lastConnectedAt =
        normalizeNullableText(value.lastConnectedAt) ?? normalizeNullableText(value.lastEventAt);
    const lastDisconnectedAt = normalizeNullableText(value.lastDisconnectedAt);
    const lastDisconnectReason = normalizeNullableText(value.lastDisconnectReason);
    const lastEventAt =
        normalizeNullableText(value.lastEventAt) ?? normalizeNullableText(value.lastConnectedAt);
    const nextReconnectAt = normalizeNullableText(value.nextReconnectAt);
    const leaseExpiresAt = normalizeNullableText(value.leaseExpiresAt);
    const instanceId = normalizeNullableText(value.instanceId);
    const connectionId = normalizeNullableText(value.connectionId);
    const status = resolveLegacySignalRStatus(value);

    switch (status) {
        case 'idle':
            return createIdleSignalRState({
                serverUrl,
                lastConnectedAt,
                lastDisconnectedAt,
                lastDisconnectReason,
                lastEventAt,
            });
        case 'connecting':
            if (!instanceId) {
                return createIdleSignalRState({
                    serverUrl,
                    lastConnectedAt,
                    lastDisconnectedAt,
                    lastDisconnectReason,
                    lastEventAt,
                });
            }

            return {
                status: 'connecting',
                instanceId,
                connectionId: null,
                serverUrl,
                reconnectAttempt,
                lastConnectedAt,
                lastDisconnectedAt,
                lastDisconnectReason,
                lastEventAt,
                nextReconnectAt: null,
                leaseExpiresAt: null,
            };
        case 'connected':
            if (!instanceId || !lastConnectedAt || !lastEventAt) {
                return createIdleSignalRState({
                    serverUrl,
                    lastConnectedAt,
                    lastDisconnectedAt,
                    lastDisconnectReason,
                    lastEventAt,
                });
            }

            return {
                status: 'connected',
                instanceId,
                connectionId,
                serverUrl,
                reconnectAttempt: 0,
                lastConnectedAt,
                lastDisconnectedAt,
                lastDisconnectReason,
                lastEventAt,
                nextReconnectAt: null,
                leaseExpiresAt: leaseExpiresAt ?? lastEventAt,
            };
        case 'polling':
            return {
                status: 'polling',
                instanceId: null,
                connectionId: null,
                serverUrl,
                reconnectAttempt,
                lastConnectedAt,
                lastDisconnectedAt,
                lastDisconnectReason,
                lastEventAt,
                nextReconnectAt,
                leaseExpiresAt: null,
            };
        case 'backoff':
            if (!nextReconnectAt) {
                return {
                    status: 'polling',
                    instanceId: null,
                    connectionId: null,
                    serverUrl,
                    reconnectAttempt,
                    lastConnectedAt,
                    lastDisconnectedAt,
                    lastDisconnectReason,
                    lastEventAt,
                    nextReconnectAt: null,
                    leaseExpiresAt: null,
                };
            }

            return {
                status: 'backoff',
                instanceId: null,
                connectionId: null,
                serverUrl,
                reconnectAttempt,
                lastConnectedAt,
                lastDisconnectedAt,
                lastDisconnectReason,
                lastEventAt,
                nextReconnectAt,
                leaseExpiresAt: null,
            };
        case 'suspended':
            return {
                status: 'suspended',
                instanceId: null,
                connectionId: null,
                serverUrl,
                reconnectAttempt,
                lastConnectedAt,
                lastDisconnectedAt,
                lastDisconnectReason,
                lastEventAt,
                nextReconnectAt,
                leaseExpiresAt: null,
            };
    }
}

export function normalizeRuntime(value: unknown): RuntimeState {
    if (!isObject(value)) {
        return {
            ...DEFAULT_RUNTIME_STATE,
            signalr: { ...DEFAULT_RUNTIME_STATE.signalr },
        };
    }

    return {
        ...DEFAULT_RUNTIME_STATE,
        ...value,
        signalr: normalizeSignalRState(value.signalr),
        lastPollingReason:
            typeof value.lastPollingReason === 'string' ? value.lastPollingReason : null,
    };
}

export interface RuntimeStorageModule {
    getRuntimeState(): Promise<RuntimeState>;
    patchRuntimeState(patch: RuntimeStatePatch): Promise<RuntimeState>;
    setSignalRState(state: SignalRState): Promise<SignalRState>;
}

export function createRuntimeStorage(client: StorageClient): RuntimeStorageModule {
    async function getRuntimeState(): Promise<RuntimeState> {
        const response = await client.get(STORAGE_FIELDS.runtime);
        return normalizeRuntime(response[STORAGE_FIELDS.runtime]);
    }

    return {
        getRuntimeState,
        async patchRuntimeState(patch) {
            const current = await getRuntimeState();
            const next = normalizeRuntime({
                ...current,
                ...patch,
                signalr: patch.signalr ?? current.signalr,
            });

            await client.set({ [STORAGE_FIELDS.runtime]: next });
            return next;
        },
        async setSignalRState(state) {
            const currentRuntime = await getRuntimeState();
            const nextSignalR = normalizeSignalRState(state);

            await client.set({
                [STORAGE_FIELDS.runtime]: {
                    ...currentRuntime,
                    signalr: nextSignalR,
                },
            });

            return nextSignalR;
        },
    };
}
