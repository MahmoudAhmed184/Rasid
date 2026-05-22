import { browser } from 'wxt/browser';

type BrowserStorageArea = typeof browser.storage.local;

export interface StorageClient {
    get(keys: string | readonly string[]): Promise<Record<string, unknown>>;
    getAll(): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string | readonly string[]): Promise<void>;
}

function createStorageClient(storageArea: BrowserStorageArea): StorageClient {
    return {
        async get(keys) {
            return (await storageArea.get([...new Set([keys].flat())])) as Record<string, unknown>;
        },
        async getAll() {
            return (await storageArea.get(null)) as Record<string, unknown>;
        },
        async set(items) {
            await storageArea.set(items);
        },
        async remove(keys) {
            if (typeof keys === 'string') {
                await storageArea.remove(keys);
                return;
            }

            await storageArea.remove([...keys]);
        },
    };
}

export function createBrowserStorageClient(): StorageClient {
    return createStorageClient(browser.storage.local);
}

export function createBrowserSessionStorageClient(): StorageClient {
    return createStorageClient(browser.storage.session);
}

export async function restrictBrowserSessionStorageToTrustedContexts(): Promise<void> {
    try {
        await browser.storage.session.setAccessLevel({
            accessLevel: 'TRUSTED_CONTEXTS',
        });
    } catch (error) {
        console.warn('[storage] failed to restrict session storage access', error);
    }
}
