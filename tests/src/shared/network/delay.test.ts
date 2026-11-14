import { describe, expect, it, vi } from 'vitest';

import { delay } from '../../../../src/shared/network/delay';

describe('delay network helper', () => {
    it('resolves after the specified duration', async () => {
        vi.useFakeTimers();

        let resolved = false;
        const promise = delay(100).then(() => {
            resolved = true;
        });

        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(50);
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(50);
        await promise;
        expect(resolved).toBe(true);

        vi.useRealTimers();
    });
});
