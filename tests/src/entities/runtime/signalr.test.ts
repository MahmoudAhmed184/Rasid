import { describe, expect, it } from 'vitest';

import {
    DEFAULT_SIGNALR_URL,
    redactSignalRUrl,
    resolveSignalRServerUrl,
} from '../../../../src/entities/runtime/signalr';

describe('SignalR runtime URL helpers', () => {
    it('resolves valid backend URLs and falls back to default', () => {
        expect(resolveSignalRServerUrl(DEFAULT_SIGNALR_URL)).toBe(DEFAULT_SIGNALR_URL);
        expect(resolveSignalRServerUrl('https://evil.example/hub')).toBe('https://evil.example/hub');
        expect(resolveSignalRServerUrl(null)).toBe(DEFAULT_SIGNALR_URL);
    });
    it('redacts query strings and credentials from displayable URLs', () => {
        expect(redactSignalRUrl(`${DEFAULT_SIGNALR_URL}?access_token=secret`)).toBe(
            DEFAULT_SIGNALR_URL
        );
    });
});
