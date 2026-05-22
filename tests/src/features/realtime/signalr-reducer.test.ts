import { describe, expect, it } from 'vitest';

import { DEFAULT_RUNTIME_STATE, DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import {
    computeReconnectDelayMinutes,
    reduceSignalRState,
    resolveDesiredTransport,
} from '../../../../src/features/realtime/signalr-reducer';

const context = {
    nowIso: '2026-05-22T10:00:00.000Z',
    workerInstanceId: 'worker-1',
};

describe('SignalR reducer', () => {
    it('resolves desired transport from settings and enabled platforms', () => {
        expect(resolveDesiredTransport(DEFAULT_SETTINGS)).toBe('signalr');
        expect(resolveDesiredTransport({ ...DEFAULT_SETTINGS, systemEnabled: false })).toBe(
            'disabled'
        );
        expect(resolveDesiredTransport({ ...DEFAULT_SETTINGS, notificationMode: 'polling' })).toBe(
            'polling'
        );
        expect(
            resolveDesiredTransport({
                ...DEFAULT_SETTINGS,
                monitoredPlatforms: {
                    mostaql: false,
                    khamsat: false,
                    nafezly: false,
                },
            })
        ).toBe('polling');
    });

    it('bounds exponential reconnect delays', () => {
        expect(computeReconnectDelayMinutes(0)).toBe(1);
        expect(computeReconnectDelayMinutes(3)).toBe(4);
        expect(computeReconnectDelayMinutes(99)).toBe(15);
    });

    it('transitions connected state and schedules lease alarms', () => {
        const transition = reduceSignalRState(
            DEFAULT_RUNTIME_STATE.signalr,
            {
                type: 'ENTER_CONNECTED',
                serverUrl: 'https://rasid.example/signalr',
                connectionId: 'conn-1',
                connectedAt: context.nowIso,
                leaseExpiresAt: '2026-05-22T10:02:00.000Z',
            },
            context
        );

        expect(transition.state).toMatchObject({
            status: 'connected',
            instanceId: 'worker-1',
            connectionId: 'conn-1',
            reconnectAttempt: 0,
        });
        expect(transition.effects).toEqual([
            { kind: 'clear-alarm', name: 'signalr:reconnect' },
            {
                kind: 'schedule-alarm',
                name: 'signalr:lease',
                delayInMinutes: 4.5,
            },
        ]);
    });
});
