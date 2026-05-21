import { normalizeProposalStateBackupPatch, PROPOSAL_STATE_KEYS } from '../../shared/storage/modules/proposal-state-storage';
import { normalizeImportedState, normalizeStoredStateSnapshot } from '../../shared/storage/snapshot-state';
import type { StorageClient } from '../../shared/browser/storage-client';
import { SNAPSHOT_KEYS } from '../../shared/storage/storage-keys';

export interface BackupRepository {
    exportAll(): Promise<Record<string, unknown>>;
    importAll(snapshot: unknown): Promise<void>;
}

const BACKUP_KEYS = [...SNAPSHOT_KEYS, ...PROPOSAL_STATE_KEYS] as const;

export function createBackupRepository(client: StorageClient): BackupRepository {
    return {
        async exportAll() {
            const raw = await client.get(BACKUP_KEYS);
            const proposalStatePatch = normalizeProposalStateBackupPatch(raw);

            return {
                ...normalizeStoredStateSnapshot(raw),
                ...proposalStatePatch.setItems,
            };
        },
        async importAll(snapshot: unknown) {
            if (!snapshot || typeof snapshot !== 'object') {
                throw new Error('Invalid backup payload.');
            }

            const snapshotRecord = snapshot as Record<string, unknown>;
            const normalizedSnapshot = normalizeImportedState(snapshotRecord);
            const proposalStatePatch = normalizeProposalStateBackupPatch(snapshotRecord);

            if (proposalStatePatch.removeKeys.length > 0) {
                await client.remove(proposalStatePatch.removeKeys);
            }

            await client.set({
                ...normalizedSnapshot,
                ...proposalStatePatch.setItems,
            });
        },
    };
}
