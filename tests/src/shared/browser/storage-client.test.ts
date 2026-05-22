import { describe, expect, it, vi } from 'vitest';

import {
    createBrowserSessionStorageClient,
    createBrowserStorageClient,
    restrictBrowserSessionStorageToTrustedContexts,
} from '../../../../src/shared/browser/storage-client';
import { fakeBrowser } from '../../../support/fake-browser';

type SessionAccessLevelOptions = {
    readonly accessLevel: 'TRUSTED_CONTEXTS';
};

function installSessionAccessLevelMock(
    implementation: (options: SessionAccessLevelOptions) => Promise<void>
) {
    const setAccessLevel = vi.fn(implementation);

    Object.defineProperty(fakeBrowser.storage.session, 'setAccessLevel', {
        configurable: true,
        value: setAccessLevel,
    });

    return setAccessLevel;
}

describe('browser storage client', () => {
    it('normalizes duplicate get keys and removes string or array keys', async () => {
        const client = createBrowserStorageClient();

        await client.set({ a: 1, b: 2 });

        await expect(client.get(['a', 'a', 'b'])).resolves.toEqual({ a: 1, b: 2 });
        await client.remove('a');
        await expect(client.get(['a', 'b'])).resolves.toEqual({ a: undefined, b: 2 });
        await client.remove(['b']);
        await expect(client.getAll()).resolves.toEqual({});
    });

    it('uses session storage for secrets and restricts access level when available', async () => {
        const client = createBrowserSessionStorageClient();
        const setAccessLevel = installSessionAccessLevelMock(async () => undefined);

        await client.set({ aiApiKey: 'secret' });
        await expect(client.get('aiApiKey')).resolves.toEqual({ aiApiKey: 'secret' });
        await restrictBrowserSessionStorageToTrustedContexts();

        expect(setAccessLevel).toHaveBeenCalledWith({
            accessLevel: 'TRUSTED_CONTEXTS',
        });
    });

    it('logs and continues if session access restriction is unavailable', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        installSessionAccessLevelMock(async () => {
            throw new Error('unsupported');
        });

        await expect(restrictBrowserSessionStorageToTrustedContexts()).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalledWith(
            '[storage] failed to restrict session storage access',
            expect.any(Error)
        );
    });
});
