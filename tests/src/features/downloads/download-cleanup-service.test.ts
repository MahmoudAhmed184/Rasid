import { describe, expect, it, vi } from 'vitest';

import { createDownloadCleanupService } from '../../../../src/features/downloads/download-cleanup-service';
import type { OffscreenManager } from '../../../../src/features/offscreen/manager';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';
import type { PendingDownloadCleanup } from '../../../../src/shared/storage/schema';
import { fakeBrowser } from '../../../support/fake-browser';

function createStorage(initial: PendingDownloadCleanup[] = []) {
    const records = new Map(initial.map((record) => [record.downloadId, record]));

    return {
        records,
        storage: {
            storePendingDownloadCleanup: vi.fn(async (payload: PendingDownloadCleanup) => {
                records.set(payload.downloadId, payload);
            }),
            consumePendingDownloadCleanup: vi.fn(async (downloadId: number) => {
                const payload = records.get(downloadId) ?? null;
                records.delete(downloadId);
                return payload;
            }),
            listPendingDownloadCleanups: vi.fn(
                async (): Promise<PendingDownloadCleanup[]> => [...records.values()]
            ),
            pruneExpiredDownloadCleanups: vi.fn(async (): Promise<PendingDownloadCleanup[]> => []),
        } satisfies Pick<
            ExtensionStorage,
            | 'storePendingDownloadCleanup'
            | 'consumePendingDownloadCleanup'
            | 'listPendingDownloadCleanups'
            | 'pruneExpiredDownloadCleanups'
        >,
    };
}

describe('download cleanup service', () => {
    it('tracks object URL downloads with creation timestamps', async () => {
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const { storage } = createStorage();
        const request = vi.fn();
        const offscreen = { request: request as unknown as OffscreenManager['request'] };
        const service = createDownloadCleanupService(
            storage as unknown as ExtensionStorage,
            offscreen as unknown as OffscreenManager
        );

        await service.trackObjectUrlDownload({
            downloadId: 7,
            objectUrl: 'blob:zip',
            filename: 'export.zip',
        });

        expect(storage.storePendingDownloadCleanup).toHaveBeenCalledWith({
            downloadId: 7,
            objectUrl: 'blob:zip',
            filename: 'export.zip',
            createdAt: '2026-05-22T12:00:00.000Z',
        });
    });

    it('cleans up terminal download records from browser download events', async () => {
        type DownloadChangedListener = Parameters<
            typeof fakeBrowser.downloads.onChanged.addListener
        >[0];
        type DownloadDelta = Parameters<DownloadChangedListener>[0];
        let onChanged: DownloadChangedListener | null = null;

        vi.spyOn(fakeBrowser.downloads.onChanged, 'addListener').mockImplementation(
            (listener: DownloadChangedListener) => {
                onChanged = listener;
            }
        );
        const { storage } = createStorage([
            {
                downloadId: 7,
                objectUrl: 'blob:zip',
                filename: 'export.zip',
                createdAt: '2026-05-22T12:00:00.000Z',
            },
        ]);
        const request = vi.fn(async () => ({ success: true as const }));
        const offscreen = { request: request as unknown as OffscreenManager['request'] };
        const service = createDownloadCleanupService(
            storage as unknown as ExtensionStorage,
            offscreen as unknown as OffscreenManager
        );

        service.registerHandlers();
        if (!onChanged) {
            throw new Error('Expected download change listener to be registered.');
        }
        onChanged({
            id: 7,
            state: { current: 'complete' },
        } as DownloadDelta);

        await vi.waitFor(() =>
            expect(request).toHaveBeenCalledWith('downloads.revoke-object-url', {
                objectUrl: 'blob:zip',
            })
        );
        expect(storage.consumePendingDownloadCleanup).toHaveBeenCalledWith(7);
    });

    it('reconciles expired and already-terminal pending cleanups', async () => {
        const expired: PendingDownloadCleanup = {
            downloadId: 1,
            objectUrl: 'blob:expired',
            filename: 'expired.zip',
            createdAt: '2026-05-22T11:00:00.000Z',
        };
        const pending: PendingDownloadCleanup = {
            downloadId: 2,
            objectUrl: 'blob:pending',
            filename: 'pending.zip',
            createdAt: '2026-05-22T12:00:00.000Z',
        };
        const { storage } = createStorage([pending]);
        storage.pruneExpiredDownloadCleanups.mockResolvedValue([expired]);
        vi.spyOn(fakeBrowser.downloads, 'search').mockResolvedValue([
            { id: 2, state: 'complete' } as Browser.downloads.DownloadItem,
        ]);
        const request = vi.fn(async () => ({ success: true as const }));
        const offscreen = { request: request as unknown as OffscreenManager['request'] };
        const service = createDownloadCleanupService(
            storage as unknown as ExtensionStorage,
            offscreen as unknown as OffscreenManager
        );

        await service.reconcilePendingCleanups();

        expect(request).toHaveBeenCalledWith('downloads.revoke-object-url', {
            objectUrl: 'blob:expired',
        });
        expect(request).toHaveBeenCalledWith('downloads.revoke-object-url', {
            objectUrl: 'blob:pending',
        });
    });
});
