import { describe, expect, it } from 'vitest';

import {
    createRuntimeStorage,
    normalizeRuntime,
    normalizeSignalRState,
} from '../../../../src/shared/storage/modules/runtime-storage';
import type { SignalRState } from '../../../../src/entities/runtime/model';
import { DEFAULT_RUNTIME_STATE } from '../../../../src/shared/storage/schema';
import { createMemoryStorage } from '../../../support/fake-storage';

describe('runtime storage normalization', () => {
    it('normalizes legacy fallback SignalR state into polling', () => {
        expect(
            normalizeSignalRState({
                status: 'connected',
                isFallbackActive: true,
                serverUrl: 'https://evil.example/hub',
                reconnectAttempt: -5,
            })
        ).toMatchObject({
            status: 'polling',
            serverUrl: DEFAULT_RUNTIME_STATE.signalr.serverUrl,
            reconnectAttempt: 0,
        });
    });

    it('downgrades incomplete connected/backoff states to safe fallback states', () => {
        expect(normalizeSignalRState({ status: 'connecting' }).status).toBe('idle');
        expect(normalizeSignalRState({ status: 'connected', instanceId: 'worker' }).status).toBe(
            'idle'
        );
        expect(normalizeSignalRState({ status: 'backoff', reconnectAttempt: 2 }).status).toBe(
            'polling'
        );
    });

    it('normalizes complete SignalR live, backoff, and suspended states', () => {
        expect(
            normalizeSignalRState({
                status: 'connected',
                instanceId: 'worker-1',
                connectionId: 'connection-1',
                serverUrl: 'https://freelancia.runasp.net/jobNotificationHub',
                reconnectAttempt: 3,
                lastConnectedAt: '2026-05-22T10:00:00.000Z',
                lastEventAt: '2026-05-22T10:01:00.000Z',
            })
        ).toEqual({
            status: 'connected',
            instanceId: 'worker-1',
            connectionId: 'connection-1',
            serverUrl: DEFAULT_RUNTIME_STATE.signalr.serverUrl,
            reconnectAttempt: 0,
            lastConnectedAt: '2026-05-22T10:00:00.000Z',
            lastDisconnectedAt: null,
            lastDisconnectReason: null,
            lastEventAt: '2026-05-22T10:01:00.000Z',
            nextReconnectAt: null,
            leaseExpiresAt: '2026-05-22T10:01:00.000Z',
        });

        expect(
            normalizeSignalRState({
                status: 'backoff',
                reconnectAttempt: 4,
                lastConnectedAt: '2026-05-22T10:00:00.000Z',
                lastDisconnectedAt: '2026-05-22T10:05:00.000Z',
                lastDisconnectReason: 'closed',
                lastEventAt: '2026-05-22T10:00:00.000Z',
                nextReconnectAt: '2026-05-22T10:10:00.000Z',
            })
        ).toMatchObject({
            status: 'backoff',
            reconnectAttempt: 4,
            nextReconnectAt: '2026-05-22T10:10:00.000Z',
        });

        expect(
            normalizeSignalRState({
                status: 'suspended',
                reconnectAttempt: 2,
                nextReconnectAt: '2026-05-22T10:10:00.000Z',
            })
        ).toMatchObject({
            status: 'suspended',
            reconnectAttempt: 2,
            nextReconnectAt: '2026-05-22T10:10:00.000Z',
        });
    });

    it('truncates malformed runtime monitoring errors', () => {
        const runtime = normalizeRuntime({
            lastPollingReason: 'manual',
            lastMonitoringErrors: {
                mostaql: {
                    message: 'x'.repeat(300),
                    failedAt: '2026-05-22T12:00:00.000Z',
                },
                bad: {
                    message: 123,
                },
            },
        });

        expect(runtime.lastPollingReason).toBe('manual');
        expect(runtime.lastMonitoringErrors.mostaql?.message).toHaveLength(240);
        expect(runtime.lastMonitoringErrors.bad).toBeUndefined();
    });

    it('returns default runtime for malformed stored runtime values', () => {
        expect(normalizeRuntime(null)).toEqual({
            ...DEFAULT_RUNTIME_STATE,
            signalr: { ...DEFAULT_RUNTIME_STATE.signalr },
        });
        expect(normalizeRuntime({ lastPollingReason: 123 })).toMatchObject({
            lastPollingReason: null,
            lastMonitoringAttemptAt: null,
            lastMonitoringSuccessAt: null,
            lastMonitoringErrors: {},
        });
    });

    it('patches runtime state and persists normalized SignalR state', async () => {
        const client = createMemoryStorage();
        const storage = createRuntimeStorage(client);

        await storage.patchRuntimeState({
            lastPollingReason: 'manual',
            lastMonitoringAttemptAt: '2026-05-22T12:00:00.000Z',
        });
        const connectingState: SignalRState = {
            status: 'connecting',
            serverUrl: DEFAULT_RUNTIME_STATE.signalr.serverUrl,
            instanceId: 'worker-1',
            connectionId: null,
            reconnectAttempt: 0,
            lastConnectedAt: null,
            lastDisconnectedAt: null,
            lastDisconnectReason: null,
            lastEventAt: null,
            nextReconnectAt: null,
            leaseExpiresAt: null,
        };
        await storage.setSignalRState(connectingState);

        expect((client.snapshot().runtime as Record<string, unknown>).lastPollingReason).toBe(
            'manual'
        );
        expect((client.snapshot().runtime as { signalr: { status: string } }).signalr.status).toBe(
            'connecting'
        );
    });

    it('reads default runtime state and normalizes signalr patches before persistence', async () => {
        const client = createMemoryStorage();
        const storage = createRuntimeStorage(client);

        await expect(storage.getRuntimeState()).resolves.toEqual({
            ...DEFAULT_RUNTIME_STATE,
            signalr: { ...DEFAULT_RUNTIME_STATE.signalr },
        });

        const next = await storage.patchRuntimeState({
            signalr: {
                status: 'backoff',
                instanceId: null,
                connectionId: null,
                serverUrl: DEFAULT_RUNTIME_STATE.signalr.serverUrl,
                reconnectAttempt: 2,
                lastConnectedAt: null,
                lastDisconnectedAt: '2026-05-22T10:00:00.000Z',
                lastDisconnectReason: 'failed',
                lastEventAt: null,
                nextReconnectAt: '',
                leaseExpiresAt: null,
            } as SignalRState,
        });

        expect(next.signalr).toMatchObject({
            status: 'polling',
            reconnectAttempt: 2,
            nextReconnectAt: null,
        });
        expect((client.snapshot().runtime as { signalr: { status: string } }).signalr.status).toBe(
            'polling'
        );
    });
});
