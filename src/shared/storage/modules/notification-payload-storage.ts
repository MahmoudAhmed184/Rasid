import type { StoredNotificationPayload } from '../schema';
import type { StorageClient } from '../../browser/storage-client';
import { NOTIFICATION_KEY_PREFIX } from '../storage-keys';

const NOTIFICATION_PAYLOAD_TTL_MS = 24 * 60 * 60 * 1000;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeStoredNotificationPayload(value: unknown): StoredNotificationPayload | null {
    if (
        !isObject(value) ||
        typeof value.url !== 'string' ||
        value.url.length === 0 ||
        (typeof value.jobId !== 'undefined' && typeof value.jobId !== 'string')
    ) {
        return null;
    }

    return {
        url: value.url,
        jobId: value.jobId,
        createdAt:
            typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    };
}

function isExpired(payload: StoredNotificationPayload, nowMs: number): boolean {
    const createdAt = Date.parse(payload.createdAt);
    return Number.isNaN(createdAt) || nowMs - createdAt > NOTIFICATION_PAYLOAD_TTL_MS;
}

export interface NotificationPayloadStorageModule {
    storeNotificationPayload(
        notificationId: string,
        payload: StoredNotificationPayload
    ): Promise<void>;
    removeNotificationPayload(notificationId: string): Promise<void>;
    consumeNotificationPayload(notificationId: string): Promise<StoredNotificationPayload | null>;
    pruneNotificationPayloads(): Promise<number>;
}

export function createNotificationPayloadStorage(
    client: StorageClient
): NotificationPayloadStorageModule {
    return {
        async storeNotificationPayload(notificationId, payload) {
            await client.set({
                [`${NOTIFICATION_KEY_PREFIX}${notificationId}`]: {
                    ...payload,
                    createdAt: payload.createdAt || new Date().toISOString(),
                },
            });
        },
        async removeNotificationPayload(notificationId) {
            await client.remove(`${NOTIFICATION_KEY_PREFIX}${notificationId}`);
        },
        async consumeNotificationPayload(notificationId) {
            const key = `${NOTIFICATION_KEY_PREFIX}${notificationId}`;
            const response = await client.get(key);
            await client.remove(key);

            return normalizeStoredNotificationPayload(response[key]);
        },
        async pruneNotificationPayloads() {
            const snapshot = await client.getAll();
            const nowMs = Date.now();
            const expiredKeys = Object.entries(snapshot)
                .filter(([key, value]) => {
                    if (!key.startsWith(NOTIFICATION_KEY_PREFIX)) {
                        return false;
                    }

                    const payload = normalizeStoredNotificationPayload(value);
                    return !payload || isExpired(payload, nowMs);
                })
                .map(([key]) => key);

            if (expiredKeys.length > 0) {
                await client.remove(expiredKeys);
            }

            return expiredKeys.length;
        },
    };
}
