import { describe, expect, it } from 'vitest';

import { DEFAULT_SIGNALR_URL, redactSignalRUrl } from '../../../../src/entities/runtime/signalr';

describe('SignalR runtime URL helpers', () => {
    it('redacts query strings and credentials from displayable URLs', () => {
        expect(redactSignalRUrl()).toBe(DEFAULT_SIGNALR_URL);
        expect(redactSignalRUrl(`${DEFAULT_SIGNALR_URL}?access_token=secret`)).toBe(
            DEFAULT_SIGNALR_URL
        );
        expect(redactSignalRUrl('not a url')).toBe(DEFAULT_SIGNALR_URL);
    });
});
