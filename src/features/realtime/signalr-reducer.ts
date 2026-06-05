import {
    ALARM_NAMES,
    SIGNALR_LEASE_WINDOW_MINUTES,
    SIGNALR_RECONNECT_DELAY_MINUTES,
} from './constants';
import { DEFAULT_SIGNALR_URL } from '../../entities/runtime/signalr';
import type { SignalRState } from '../../entities/runtime/model';
import type { ExtensionSettings } from '../../entities/settings/model';
import { hasEnabledSignalRPlatform } from '../../platforms/registry';

export type DesiredTransport = 'disabled' | 'polling' | 'signalr';
export type ReconnectSignalRStatus = 'polling' | 'backoff';

const MAX_RECONNECT_DELAY_MINUTES = 15;

export type SignalREffect =
    | {
          readonly kind: 'clear-alarm';
          readonly name: string;
      }
    | {
          readonly kind: 'schedule-alarm';
          readonly name: string;
          readonly delayInMinutes: number;
      }
    | {
          readonly kind: 'schedule-alarm';
          readonly name: string;
          readonly periodInMinutes: number;
      };

export type SignalREvent =
    | {
          readonly type: 'ENTER_IDLE';
          readonly reason: string;
      }
    | {
          readonly type: 'ENTER_POLLING';
          readonly reason: string;
          readonly reconnectAttempt?: number;
          readonly nextReconnectAt?: string | null;
          readonly serverUrl?: string;
      }
    | {
          readonly type: 'ENTER_SUSPENDED';
          readonly reason: string;
          readonly reconnectAttempt?: number;
          readonly nextReconnectAt?: string | null;
          readonly serverUrl?: string;
      }
    | {
          readonly type: 'ENTER_CONNECTING';
          readonly serverUrl: string;
      }
    | {
          readonly type: 'ENTER_CONNECTED';
          readonly serverUrl: string;
          readonly connectionId: string | null;
          readonly connectedAt: string;
          readonly leaseExpiresAt: string;
      }
    | {
          readonly type: 'REFRESH_LEASE';
          readonly serverUrl: string;
          readonly connectionId: string | null;
          readonly eventAt: string;
          readonly leaseExpiresAt: string;
      }
    | {
          readonly type: 'SCHEDULE_RECONNECT';
          readonly reason: string;
          readonly attempt: number;
          readonly nextReconnectAt: string;
          readonly serverUrl: string;
          readonly status: ReconnectSignalRStatus;
      };

export interface SignalRTransitionContext {
    readonly nowIso: string;
    readonly workerInstanceId: string;
}

export interface SignalRTransition {
    readonly state: SignalRState;
    readonly effects: readonly SignalREffect[];
}

function resolveServerUrl(...args: readonly unknown[]): string {
    void args;
    return DEFAULT_SIGNALR_URL;
}

export function resolveDesiredTransport(settings: Readonly<ExtensionSettings>): DesiredTransport {
    if (settings.systemEnabled === false) {
        return 'disabled';
    }

    if (!hasEnabledSignalRPlatform(settings)) {
        return 'polling';
    }

    if (settings.notificationMode === 'polling') {
        return 'polling';
    }

    return 'signalr';
}

export function computeReconnectDelayMinutes(attempt: number): number {
    const boundedAttempt = Math.max(0, attempt);
    const exponentialDelay = SIGNALR_RECONNECT_DELAY_MINUTES * 2 ** Math.max(boundedAttempt - 1, 0);
    return Math.min(
        Math.max(exponentialDelay, SIGNALR_RECONNECT_DELAY_MINUTES),
        MAX_RECONNECT_DELAY_MINUTES
    );
}

export function reduceSignalRState(
    current: SignalRState,
    event: SignalREvent,
    context: SignalRTransitionContext
): SignalRTransition {
    switch (event.type) {
        case 'ENTER_IDLE':
            return {
                state: {
                    status: 'idle',
                    instanceId: null,
                    connectionId: null,
                    serverUrl: resolveServerUrl(current),
                    reconnectAttempt: 0,
                    lastConnectedAt: current.lastConnectedAt,
                    lastDisconnectedAt: context.nowIso,
                    lastDisconnectReason: event.reason,
                    lastEventAt: current.lastEventAt,
                    nextReconnectAt: null,
                    leaseExpiresAt: null,
                },
                effects: [
                    { kind: 'clear-alarm', name: ALARM_NAMES.signalrLease },
                    { kind: 'clear-alarm', name: ALARM_NAMES.signalrReconnect },
                ],
            };
        case 'ENTER_POLLING':
            return {
                state: {
                    status: 'polling',
                    instanceId: null,
                    connectionId: null,
                    serverUrl: resolveServerUrl(current, event.serverUrl),
                    reconnectAttempt: event.reconnectAttempt ?? current.reconnectAttempt,
                    lastConnectedAt: current.lastConnectedAt,
                    lastDisconnectedAt: context.nowIso,
                    lastDisconnectReason: event.reason,
                    lastEventAt: current.lastEventAt,
                    nextReconnectAt: event.nextReconnectAt ?? null,
                    leaseExpiresAt: null,
                },
                effects: [
                    { kind: 'clear-alarm', name: ALARM_NAMES.signalrLease },
                    { kind: 'clear-alarm', name: ALARM_NAMES.signalrReconnect },
                ],
            };
        case 'ENTER_SUSPENDED':
            return {
                state: {
                    status: 'suspended',
                    instanceId: null,
                    connectionId: null,
                    serverUrl: resolveServerUrl(current, event.serverUrl),
                    reconnectAttempt: event.reconnectAttempt ?? current.reconnectAttempt,
                    lastConnectedAt: current.lastConnectedAt,
                    lastDisconnectedAt: context.nowIso,
                    lastDisconnectReason: event.reason,
                    lastEventAt: current.lastEventAt,
                    nextReconnectAt: event.nextReconnectAt ?? null,
                    leaseExpiresAt: null,
                },
                effects: [{ kind: 'clear-alarm', name: ALARM_NAMES.signalrLease }],
            };
        case 'ENTER_CONNECTING':
            return {
                state: {
                    status: 'connecting',
                    instanceId: context.workerInstanceId,
                    connectionId: null,
                    serverUrl: event.serverUrl,
                    reconnectAttempt: current.reconnectAttempt,
                    lastConnectedAt: current.lastConnectedAt,
                    lastDisconnectedAt: current.lastDisconnectedAt,
                    lastDisconnectReason: null,
                    lastEventAt: current.lastEventAt,
                    nextReconnectAt: null,
                    leaseExpiresAt: null,
                },
                effects: [],
            };
        case 'ENTER_CONNECTED':
            return {
                state: {
                    status: 'connected',
                    instanceId: context.workerInstanceId,
                    connectionId: event.connectionId,
                    serverUrl: event.serverUrl,
                    reconnectAttempt: 0,
                    lastConnectedAt: event.connectedAt,
                    lastDisconnectedAt: current.lastDisconnectedAt,
                    lastDisconnectReason: null,
                    lastEventAt: event.connectedAt,
                    nextReconnectAt: null,
                    leaseExpiresAt: event.leaseExpiresAt,
                },
                effects: [
                    { kind: 'clear-alarm', name: ALARM_NAMES.signalrReconnect },
                    {
                        kind: 'schedule-alarm',
                        name: ALARM_NAMES.signalrLease,
                        delayInMinutes: SIGNALR_LEASE_WINDOW_MINUTES,
                    },
                ],
            };
        case 'REFRESH_LEASE':
            return {
                state: {
                    status: 'connected',
                    instanceId: context.workerInstanceId,
                    connectionId: event.connectionId,
                    serverUrl: event.serverUrl,
                    reconnectAttempt: 0,
                    lastConnectedAt:
                        current.status === 'connected' ? current.lastConnectedAt : event.eventAt,
                    lastDisconnectedAt: current.lastDisconnectedAt,
                    lastDisconnectReason: null,
                    lastEventAt: event.eventAt,
                    nextReconnectAt: null,
                    leaseExpiresAt: event.leaseExpiresAt,
                },
                effects: [
                    {
                        kind: 'schedule-alarm',
                        name: ALARM_NAMES.signalrLease,
                        delayInMinutes: SIGNALR_LEASE_WINDOW_MINUTES,
                    },
                ],
            };
        case 'SCHEDULE_RECONNECT':
            return {
                state: {
                    status: event.status,
                    instanceId: null,
                    connectionId: null,
                    serverUrl: event.serverUrl,
                    reconnectAttempt: event.attempt,
                    lastConnectedAt: current.lastConnectedAt,
                    lastDisconnectedAt: context.nowIso,
                    lastDisconnectReason: event.reason,
                    lastEventAt: current.lastEventAt,
                    nextReconnectAt: event.nextReconnectAt,
                    leaseExpiresAt: null,
                },
                effects: [
                    { kind: 'clear-alarm', name: ALARM_NAMES.signalrLease },
                    {
                        kind: 'schedule-alarm',
                        name: ALARM_NAMES.signalrReconnect,
                        delayInMinutes: Math.max(
                            (Date.parse(event.nextReconnectAt) - Date.parse(context.nowIso)) /
                                60000,
                            SIGNALR_RECONNECT_DELAY_MINUTES
                        ),
                    },
                ],
            };
    }
}
