import { describe, expect, it } from 'vitest';

import {
    isSignalRFallbackState,
    isSignalRLiveState,
    type SignalRState,
} from '../../../../src/entities/runtime/model';

describe('runtime state type guards', () => {
    it.each([
        ['connecting', true, false],
        ['connected', true, false],
        ['polling', false, true],
        ['backoff', false, true],
        ['suspended', false, true],
        ['idle', false, false],
    ] as const)('classifies %s SignalR states', (status, live, fallback) => {
        const state = { status } as SignalRState;

        expect(isSignalRLiveState(state)).toBe(live);
        expect(isSignalRFallbackState(state)).toBe(fallback);
    });
});
