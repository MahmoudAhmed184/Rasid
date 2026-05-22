import { describe, expect, it, vi } from 'vitest';

import { executeSignalREffects } from '../../../../src/features/realtime/signalr-effects';
import { fakeBrowser } from '../../../support/fake-browser';

describe('SignalR alarm effects', () => {
    it('schedules alarms using only supported alarm create fields', async () => {
        const createAlarm = vi.spyOn(fakeBrowser.alarms, 'create');

        await executeSignalREffects([
            {
                kind: 'schedule-alarm',
                name: 'jobs:poll',
                periodInMinutes: 5,
            },
            {
                kind: 'schedule-alarm',
                name: 'signalr:reconnect',
                delayInMinutes: 1,
            },
        ]);

        expect(createAlarm).toHaveBeenNthCalledWith(1, 'jobs:poll', {
            periodInMinutes: 5,
        });
        expect(createAlarm).toHaveBeenNthCalledWith(2, 'signalr:reconnect', {
            delayInMinutes: 1,
        });
    });
});
