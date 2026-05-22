export type SignalRLiveStatus = 'connecting' | 'connected';
export type SignalRFallbackStatus = 'polling' | 'backoff' | 'suspended';
export type SignalRStatus = 'idle' | SignalRLiveStatus | SignalRFallbackStatus;

interface SignalRStateBase {
    serverUrl: string;
    reconnectAttempt: number;
    lastConnectedAt: string | null;
    lastDisconnectedAt: string | null;
    lastDisconnectReason: string | null;
    lastEventAt: string | null;
    nextReconnectAt: string | null;
    leaseExpiresAt: string | null;
}

export interface IdleSignalRState extends SignalRStateBase {
    status: 'idle';
    instanceId: null;
    connectionId: null;
    reconnectAttempt: 0;
    nextReconnectAt: null;
    leaseExpiresAt: null;
}

export interface ConnectingSignalRState extends SignalRStateBase {
    status: 'connecting';
    instanceId: string;
    connectionId: null;
    nextReconnectAt: null;
    leaseExpiresAt: null;
}

export interface ConnectedSignalRState extends SignalRStateBase {
    status: 'connected';
    instanceId: string;
    connectionId: string | null;
    reconnectAttempt: 0;
    lastConnectedAt: string;
    lastEventAt: string;
    nextReconnectAt: null;
    leaseExpiresAt: string;
}

export interface PollingSignalRState extends SignalRStateBase {
    status: 'polling';
    instanceId: null;
    connectionId: null;
    leaseExpiresAt: null;
}

export interface BackoffSignalRState extends SignalRStateBase {
    status: 'backoff';
    instanceId: null;
    connectionId: null;
    nextReconnectAt: string;
    leaseExpiresAt: null;
}

export interface SuspendedSignalRState extends SignalRStateBase {
    status: 'suspended';
    instanceId: null;
    connectionId: null;
    leaseExpiresAt: null;
}

export type SignalRState =
    | IdleSignalRState
    | ConnectingSignalRState
    | ConnectedSignalRState
    | PollingSignalRState
    | BackoffSignalRState
    | SuspendedSignalRState;

export interface MonitoringFetchFailure {
    readonly message: string;
    readonly failedAt: string;
}

export interface RuntimeState {
    signalr: SignalRState;
    lastPollingReason: string | null;
    lastMonitoringAttemptAt: string | null;
    lastMonitoringSuccessAt: string | null;
    lastMonitoringErrors: Record<string, MonitoringFetchFailure>;
}

export function isSignalRLiveState(
    state: SignalRState
): state is Extract<SignalRState, { status: SignalRLiveStatus }> {
    return state.status === 'connecting' || state.status === 'connected';
}

export function isSignalRFallbackState(
    state: SignalRState
): state is Extract<SignalRState, { status: SignalRFallbackStatus }> {
    return state.status === 'polling' || state.status === 'backoff' || state.status === 'suspended';
}
