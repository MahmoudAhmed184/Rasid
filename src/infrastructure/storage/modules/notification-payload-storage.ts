import type { StoredNotificationPayload } from '../schema';
import type { StorageClient } from '../storage-client';
import { NOTIFICATION_KEY_PREFIX } from '../storage-keys';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isStoredNotificationPayload(value: unknown): value is StoredNotificationPayload {
    return (
        isObject(value) &&
        typeof value.url === 'string' &&
        value.url.length > 0 &&
        (typeof value.jobId === 'undefined' || typeof value.jobId === 'string')
    );
}

export interface NotificationPayloadStorageModule {
    storeNotificationPayload(
        notificationId: string,
        payload: StoredNotificationPayload
    ): Promise<void>;
    consumeNotificationPayload(notificationId: string): Promise<StoredNotificationPayload | null>;
}

export function createNotificationPayloadStorage(
    client: StorageClient
): NotificationPayloadStorageModule {
    return {
        async storeNotificationPayload(notificationId, payload) {
            await client.set({
                [`${NOTIFICATION_KEY_PREFIX}${notificationId}`]: payload,
            });
        },
        async consumeNotificationPayload(notificationId) {
            const key = `${NOTIFICATION_KEY_PREFIX}${notificationId}`;
            const response = await client.get(key);
            await client.remove(key);

            return isStoredNotificationPayload(response[key]) ? response[key] : null;
        },
    };
}
