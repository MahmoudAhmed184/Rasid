import { describe, expect, it } from 'vitest';

import { createDownloadCleanupStorage } from '../../../../src/shared/storage/modules/download-cleanup-storage';
import { createMemoryStorage } from '../../../support/fake-storage';
import { useFixedSystemTime } from '../../../support/timers';

describe('download cleanup storage', () => {
    it('stores and consumes cleanup records once', async () => {
        const storage = createMemoryStorage();
        const cleanups = createDownloadCleanupStorage(storage);

        await cleanups.storePendingDownloadCleanup({
            downloadId: 42,
            objectUrl: 'blob:rasid',
            filename: 'export.zip',
            createdAt: '2026-05-22T10:00:00.000Z',
        });

        expect(await cleanups.consumePendingDownloadCleanup(42)).toMatchObject({
            objectUrl: 'blob:rasid',
        });
        expect(await cleanups.consumePendingDownloadCleanup(42)).toBeNull();
    });

    it('lists only valid cleanup records and removes malformed consumed records', async () => {
        const storage = createMemoryStorage({
            'download-cleanup:1': {
                downloadId: 1,
                objectUrl: 'blob:valid',
                filename: 'valid.zip',
                createdAt: '2026-05-22T10:00:00.000Z',
            },
            'download-cleanup:2': {
                downloadId: Number.POSITIVE_INFINITY,
                objectUrl: 'blob:bad',
                filename: 'bad.zip',
                createdAt: '2026-05-22T10:00:00.000Z',
            },
            'other:key': {
                downloadId: 3,
                objectUrl: 'blob:ignored',
                filename: 'ignored.zip',
                createdAt: '2026-05-22T10:00:00.000Z',
            },
        });
        const cleanups = createDownloadCleanupStorage(storage);

        expect(await cleanups.listPendingDownloadCleanups()).toEqual([
            {
                downloadId: 1,
                objectUrl: 'blob:valid',
                filename: 'valid.zip',
                createdAt: '2026-05-22T10:00:00.000Z',
            },
        ]);
        expect(await cleanups.consumePendingDownloadCleanup(2)).toBeNull();
        expect(Object.keys(storage.snapshot()).sort()).toEqual(['download-cleanup:1', 'other:key']);
    });

    it('prunes expired and malformed cleanup records while returning valid expired payloads', async () => {
        useFixedSystemTime('2026-05-22T12:00:00.000Z');
        const storage = createMemoryStorage({
            'download-cleanup:1': {
                downloadId: 1,
                objectUrl: 'blob:old',
                filename: 'old.zip',
                createdAt: '2026-05-22T11:00:00.000Z',
            },
            'download-cleanup:2': {
                downloadId: 2,
                objectUrl: 'blob:fresh',
                filename: 'fresh.zip',
                createdAt: '2026-05-22T11:45:00.000Z',
            },
            'download-cleanup:3': {
                downloadId: 'bad',
            },
        });
        const cleanups = createDownloadCleanupStorage(storage);

        const expired = await cleanups.pruneExpiredDownloadCleanups();

        expect(expired).toHaveLength(1);
        expect(expired[0]?.objectUrl).toBe('blob:old');
        expect(Object.keys(storage.snapshot()).sort()).toEqual(['download-cleanup:2']);
    });

    it('keeps fresh cleanup records during prune and returns no expired payloads', async () => {
        useFixedSystemTime('2026-05-22T12:00:00.000Z');
        const storage = createMemoryStorage({
            'download-cleanup:5': {
                downloadId: 5,
                objectUrl: 'blob:fresh',
                filename: 'fresh.zip',
                createdAt: '2026-05-22T11:59:00.000Z',
            },
            unrelated: true,
        });
        const cleanups = createDownloadCleanupStorage(storage);

        await expect(cleanups.pruneExpiredDownloadCleanups()).resolves.toEqual([]);
        expect(Object.keys(storage.snapshot()).sort()).toEqual(['download-cleanup:5', 'unrelated']);
    });
});
