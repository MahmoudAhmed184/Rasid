import { describe, expect, it, vi } from 'vitest';

import {
    createAdminMessageStorage,
    type AdminMessage,
} from '../../../../src/shared/storage/modules/admin-message-storage';
import { createMemoryStorage } from '../../../support/fake-storage';

describe('admin message storage', () => {
    it('returns empty array when no admin messages are stored or invalid', async () => {
        const storage = createMemoryStorage();
        const adminStorage = createAdminMessageStorage(storage);

        expect(await adminStorage.getAdminMessages()).toEqual([]);

        await storage.set({ adminMessages: 'not-an-array' });
        expect(await adminStorage.getAdminMessages()).toEqual([]);

        await storage.set({
            adminMessages: [
                null,
                123,
                { id: '1' }, // missing message, receivedAt, read
                { id: '2', message: '', receivedAt: 'now', read: false }, // empty message
                { id: '3', message: 'hello', receivedAt: 123, read: false }, // non-string receivedAt
                { id: '4', message: 'hello', receivedAt: '2026-05-22', read: 'yes' }, // non-boolean read
                { id: '5', message: 'hello', receivedAt: '2026-05-22', read: false, url: 123 }, // invalid non-string url
                {
                    id: '6',
                    message: 'hello',
                    receivedAt: '2026-05-22',
                    read: false,
                    url: { malicious: true },
                },
            ],
        });
        expect(await adminStorage.getAdminMessages()).toEqual([]);
    });

    it('stores, deduplicates by id, and caps at MAX_ADMIN_MESSAGES (20)', async () => {
        const storage = createMemoryStorage();
        const adminStorage = createAdminMessageStorage(storage);

        const msg1: AdminMessage = {
            id: 'm1',
            message: 'First message',
            receivedAt: '2026-05-22T10:00:00Z',
            read: false,
        };
        const msg2: AdminMessage = {
            id: 'm2',
            message: 'Second message',
            url: 'https://example.com/details',
            receivedAt: '2026-05-22T10:05:00Z',
            read: false,
        };

        await adminStorage.storeAdminMessage(msg1);
        let list = await adminStorage.getAdminMessages();
        expect(list).toEqual([msg1]);

        await adminStorage.storeAdminMessage(msg2);
        list = await adminStorage.getAdminMessages();
        expect(list).toEqual([msg2, msg1]);

        // Deduplication update
        const msg1Updated: AdminMessage = {
            ...msg1,
            message: 'First message updated',
        };
        await adminStorage.storeAdminMessage(msg1Updated);
        list = await adminStorage.getAdminMessages();
        expect(list).toEqual([msg1Updated, msg2]);

        // Capping at 20
        for (let i = 3; i <= 25; i++) {
            await adminStorage.storeAdminMessage({
                id: `m${i}`,
                message: `Message ${i}`,
                receivedAt: `2026-05-22T10:${i}:00Z`,
                read: false,
            });
        }
        list = await adminStorage.getAdminMessages();
        expect(list).toHaveLength(20);
        expect(list[0]?.id).toBe('m25');
    });

    it('marks admin messages as read', async () => {
        const storage = createMemoryStorage();
        const adminStorage = createAdminMessageStorage(storage);

        await adminStorage.markAdminMessagesRead(); // No-op on empty

        await adminStorage.storeAdminMessage({
            id: 'm1',
            message: 'Unread 1',
            receivedAt: '2026-05-22T10:00:00Z',
            read: false,
        });
        await adminStorage.storeAdminMessage({
            id: 'm2',
            message: 'Unread 2',
            receivedAt: '2026-05-22T10:01:00Z',
            read: false,
        });

        await adminStorage.markAdminMessagesRead();
        const list = await adminStorage.getAdminMessages();
        expect(list.every((m) => m.read)).toBe(true);

        // Subsequent call when already all read is a no-op
        const spySet = vi.spyOn(storage, 'set');
        await adminStorage.markAdminMessagesRead();
        expect(spySet).not.toHaveBeenCalled();
    });

    it('clears admin messages', async () => {
        const storage = createMemoryStorage();
        const adminStorage = createAdminMessageStorage(storage);

        await adminStorage.storeAdminMessage({
            id: 'm1',
            message: 'To be cleared',
            receivedAt: '2026-05-22T10:00:00Z',
            read: false,
        });
        expect(await adminStorage.getAdminMessages()).toHaveLength(1);

        await adminStorage.clearAdminMessages();
        expect(await adminStorage.getAdminMessages()).toEqual([]);
    });
});
