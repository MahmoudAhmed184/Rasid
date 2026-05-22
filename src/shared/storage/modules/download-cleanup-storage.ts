import type { PendingDownloadCleanup } from '../schema';
import type { StorageClient } from '../../browser/storage-client';
import { DOWNLOAD_CLEANUP_KEY_PREFIX } from '../storage-keys';

const DOWNLOAD_CLEANUP_TTL_MS = 30 * 60 * 1000;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizePendingDownloadCleanup(value: unknown): PendingDownloadCleanup | null {
    if (
        !isObject(value) ||
        typeof value.downloadId !== 'number' ||
        !Number.isFinite(value.downloadId) ||
        typeof value.objectUrl !== 'string' ||
        value.objectUrl.length === 0 ||
        typeof value.filename !== 'string' ||
        typeof value.createdAt !== 'string'
    ) {
        return null;
    }

    return {
        downloadId: value.downloadId,
        objectUrl: value.objectUrl,
        filename: value.filename,
        createdAt: value.createdAt,
    };
}

function getCleanupKey(downloadId: number): string {
    return `${DOWNLOAD_CLEANUP_KEY_PREFIX}${downloadId}`;
}

export interface DownloadCleanupStorageModule {
    storePendingDownloadCleanup(payload: PendingDownloadCleanup): Promise<void>;
    consumePendingDownloadCleanup(downloadId: number): Promise<PendingDownloadCleanup | null>;
    listPendingDownloadCleanups(): Promise<PendingDownloadCleanup[]>;
    pruneExpiredDownloadCleanups(): Promise<PendingDownloadCleanup[]>;
}

export function createDownloadCleanupStorage(client: StorageClient): DownloadCleanupStorageModule {
    return {
        async storePendingDownloadCleanup(payload) {
            await client.set({
                [getCleanupKey(payload.downloadId)]: payload,
            });
        },
        async consumePendingDownloadCleanup(downloadId) {
            const key = getCleanupKey(downloadId);
            const response = await client.get(key);
            await client.remove(key);
            return normalizePendingDownloadCleanup(response[key]);
        },
        async listPendingDownloadCleanups() {
            const snapshot = await client.getAll();
            return Object.entries(snapshot)
                .filter(([key]) => key.startsWith(DOWNLOAD_CLEANUP_KEY_PREFIX))
                .map(([, value]) => normalizePendingDownloadCleanup(value))
                .filter((value): value is PendingDownloadCleanup => value !== null);
        },
        async pruneExpiredDownloadCleanups() {
            const snapshot = await client.getAll();
            const nowMs = Date.now();
            const expired: PendingDownloadCleanup[] = [];
            const expiredKeys: string[] = [];

            for (const [key, value] of Object.entries(snapshot)) {
                if (!key.startsWith(DOWNLOAD_CLEANUP_KEY_PREFIX)) {
                    continue;
                }

                const payload = normalizePendingDownloadCleanup(value);
                const createdAt = payload ? Date.parse(payload.createdAt) : Number.NaN;

                if (
                    !payload ||
                    Number.isNaN(createdAt) ||
                    nowMs - createdAt > DOWNLOAD_CLEANUP_TTL_MS
                ) {
                    expiredKeys.push(key);

                    if (payload) {
                        expired.push(payload);
                    }
                }
            }

            if (expiredKeys.length > 0) {
                await client.remove(expiredKeys);
            }

            return expired;
        },
    };
}
