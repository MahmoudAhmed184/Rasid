import { describe, expect, it, vi } from 'vitest';

import { createConnectionStatusPanel } from '../../../../src/app/dashboard/connection';
import type { SignalRState } from '../../../../src/entities/runtime/model';
import type { MonitoringOverview } from '../../../../src/features/monitoring/repository';
import { DEFAULT_RUNTIME_STATE, DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import { installTestDom } from '../../../support/html';

function createOverview(overrides: Partial<MonitoringOverview> = {}): MonitoringOverview {
    return {
        stats: {
            lastCheck: null,
            todayCount: 0,
            todayDate: new Date().toDateString(),
        },
        seenJobsCount: 0,
        notificationsEnabled: true,
        runtime: DEFAULT_RUNTIME_STATE,
        notificationMode: DEFAULT_SETTINGS.notificationMode,
        ...overrides,
    };
}

describe('dashboard connection status panel', () => {
    const connectedSignalR: SignalRState = {
        status: 'connected',
        serverUrl: DEFAULT_RUNTIME_STATE.signalr.serverUrl,
        instanceId: 'worker',
        connectionId: 'connection',
        reconnectAttempt: 0,
        lastConnectedAt: '2026-05-22T12:00:00.000Z',
        lastDisconnectedAt: null,
        lastDisconnectReason: null,
        lastEventAt: '2026-05-22T12:00:00.000Z',
        nextReconnectAt: null,
        leaseExpiresAt: '2026-05-22T12:05:00.000Z',
    };
    const pollingSignalR: SignalRState = {
        status: 'polling',
        serverUrl: DEFAULT_RUNTIME_STATE.signalr.serverUrl,
        instanceId: null,
        connectionId: null,
        reconnectAttempt: 0,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastDisconnectReason: null,
        lastEventAt: null,
        nextReconnectAt: null,
        leaseExpiresAt: null,
    };

    it.each([
        ['polling mode', createOverview({ notificationMode: 'polling' }), 'استعلام دوري', 'blue'],
        [
            'connected SignalR',
            createOverview({
                runtime: {
                    ...DEFAULT_RUNTIME_STATE,
                    signalr: connectedSignalR,
                },
            }),
            'اتصال مباشر',
            'green',
        ],
        [
            'fallback SignalR',
            createOverview({
                runtime: {
                    ...DEFAULT_RUNTIME_STATE,
                    signalr: pollingSignalR,
                },
            }),
            'وضع الاستعلام',
            'orange',
        ],
        ['idle SignalR', createOverview(), 'غير متصل', 'purple'],
    ])('renders %s state', async (_label, overview, text, tone) => {
        const document = installTestDom(`
            <span id="stat-connection"></span>
            <span id="connection-status-icon"></span>
        `);
        const panel = createConnectionStatusPanel(document, {
            monitoringRepository: {
                getOverview: vi.fn(async () => overview),
            },
        });

        await panel.load();

        expect(document.getElementById('stat-connection')?.textContent).toBe(text);
        expect(document.getElementById('connection-status-icon')?.className).toContain(tone);
        expect(document.querySelector('#connection-status-icon i')?.className).toContain('fa');
    });

    it('does nothing when dashboard elements are missing', async () => {
        const document = installTestDom('<main></main>');
        const panel = createConnectionStatusPanel(document, {
            monitoringRepository: {
                getOverview: vi.fn(async () => createOverview()),
            },
        });

        await expect(panel.load()).resolves.toBeUndefined();
    });
});
