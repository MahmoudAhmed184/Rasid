import type { StorageClient } from '../../browser/storage-client';

const ADMIN_MESSAGES_KEY = 'adminMessages';
const MAX_ADMIN_MESSAGES = 20;

export interface AdminMessage {
    id: string;
    message: string;
    url?: string | null;
    receivedAt: string;
    read: boolean;
}

function isAdminMessage(value: unknown): value is AdminMessage {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const v = value as Record<string, unknown>;

    return (
        typeof v.id === 'string' &&
        typeof v.message === 'string' &&
        v.message.length > 0 &&
        typeof v.receivedAt === 'string' &&
        typeof v.read === 'boolean'
    );
}

export interface AdminMessageStorage {
    getAdminMessages(): Promise<AdminMessage[]>;
    storeAdminMessage(msg: AdminMessage): Promise<AdminMessage[]>;
    markAdminMessagesRead(): Promise<void>;
    clearAdminMessages(): Promise<void>;
}

export function createAdminMessageStorage(client: StorageClient): AdminMessageStorage {
    async function getAdminMessages(): Promise<AdminMessage[]> {
        const result = await client.get(ADMIN_MESSAGES_KEY);
        const raw = result[ADMIN_MESSAGES_KEY];

        if (!Array.isArray(raw)) {
            return [];
        }

        return raw.filter(isAdminMessage);
    }

    async function storeAdminMessage(msg: AdminMessage): Promise<AdminMessage[]> {
        const existing = await getAdminMessages();
        // Deduplicate by id in case of duplicate delivery
        const deduped = existing.filter((m) => m.id !== msg.id);
        const updated = [msg, ...deduped].slice(0, MAX_ADMIN_MESSAGES);

        await client.set({ [ADMIN_MESSAGES_KEY]: updated });

        return updated;
    }

    async function markAdminMessagesRead(): Promise<void> {
        const existing = await getAdminMessages();

        if (existing.length === 0 || existing.every((m) => m.read)) {
            return;
        }

        const updated = existing.map((m) => ({ ...m, read: true }));

        await client.set({ [ADMIN_MESSAGES_KEY]: updated });
    }

    async function clearAdminMessages(): Promise<void> {
        await client.set({ [ADMIN_MESSAGES_KEY]: [] });
    }

    return {
        getAdminMessages,
        storeAdminMessage,
        markAdminMessagesRead,
        clearAdminMessages,
    };
}
