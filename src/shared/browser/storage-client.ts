import { browser } from 'wxt/browser';

export interface StorageClient {
    get(keys: string | readonly string[]): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string | readonly string[]): Promise<void>;
}

export function createBrowserStorageClient(): StorageClient {
    return {
        async get(keys) {
            return (await browser.storage.local.get([...new Set([keys].flat())])) as Record<
                string,
                unknown
            >;
        },
        async set(items) {
            await browser.storage.local.set(items);
        },
        async remove(keys) {
            if (typeof keys === 'string') {
                await browser.storage.local.remove(keys);
                return;
            }

            await browser.storage.local.remove([...keys]);
        },
    };
}
