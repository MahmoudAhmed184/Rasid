import { browser } from 'wxt/browser';

import type { OffscreenManager } from '../offscreen/manager';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import type { PendingDownloadCleanup } from '../../shared/storage/schema';

export interface DownloadCleanupService {
    registerHandlers(): void;
    trackObjectUrlDownload(input: {
        readonly downloadId: number;
        readonly objectUrl: string;
        readonly filename: string;
    }): Promise<void>;
    reconcilePendingCleanups(): Promise<void>;
}

async function revokeOffscreenObjectUrl(
    offscreen: OffscreenManager,
    objectUrl: string
): Promise<void> {
    try {
        await offscreen.request('downloads.revoke-object-url', { objectUrl });
    } catch (error) {
        console.warn('[downloads] failed to revoke offscreen object URL', error);
    }
}

function isTerminalDownloadState(item: Browser.downloads.DownloadItem | undefined): boolean {
    return !item || item.state === 'complete' || item.state === 'interrupted';
}

export function createDownloadCleanupService(
    storage: ExtensionStorage,
    offscreen: OffscreenManager
): DownloadCleanupService {
    let handlersRegistered = false;

    async function cleanup(payload: PendingDownloadCleanup): Promise<void> {
        await revokeOffscreenObjectUrl(offscreen, payload.objectUrl);
    }

    async function consumeAndCleanup(downloadId: number): Promise<void> {
        const payload = await storage.consumePendingDownloadCleanup(downloadId);

        if (payload) {
            await cleanup(payload);
        }
    }

    return {
        registerHandlers() {
            if (handlersRegistered || !browser.downloads?.onChanged) {
                return;
            }

            handlersRegistered = true;

            browser.downloads.onChanged.addListener((delta) => {
                if (
                    !delta.state ||
                    (delta.state.current !== 'complete' && delta.state.current !== 'interrupted')
                ) {
                    return;
                }

                void consumeAndCleanup(delta.id).catch((error) => {
                    console.warn('[downloads] cleanup listener failed', error);
                });
            });
        },
        async trackObjectUrlDownload(input) {
            await storage.storePendingDownloadCleanup({
                downloadId: input.downloadId,
                objectUrl: input.objectUrl,
                filename: input.filename,
                createdAt: new Date().toISOString(),
            });
        },
        async reconcilePendingCleanups() {
            const expired = await storage.pruneExpiredDownloadCleanups();

            for (const payload of expired) {
                await cleanup(payload);
            }

            const pending = await storage.listPendingDownloadCleanups();

            for (const payload of pending) {
                const matches = browser.downloads?.search
                    ? await browser.downloads.search({ id: payload.downloadId })
                    : [];

                if (isTerminalDownloadState(matches[0])) {
                    await consumeAndCleanup(payload.downloadId);
                }
            }
        },
    };
}
