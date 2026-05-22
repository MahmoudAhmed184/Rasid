import {
    normalizeProposalStateBackupPatch,
    PROPOSAL_STATE_KEYS,
} from '../../shared/storage/modules/proposal-state-storage';
import {
    normalizeImportedState,
    normalizeStoredStateSnapshot,
} from '../../shared/storage/snapshot-state';
import type { StorageClient } from '../../shared/browser/storage-client';
import type { AiSecretStorageModule } from '../../shared/storage/modules/ai-secret-storage';
import { SNAPSHOT_KEYS } from '../../shared/storage/storage-keys';

export interface BackupRepository {
    exportAll(): Promise<Record<string, unknown>>;
    importAll(snapshot: unknown): Promise<void>;
}

const BACKUP_KEYS = [...SNAPSHOT_KEYS, ...PROPOSAL_STATE_KEYS] as const;
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_CONTENT_KEYS = [...SNAPSHOT_KEYS, ...PROPOSAL_STATE_KEYS] as const;

function hasRecognizedBackupContent(snapshot: Record<string, unknown>): boolean {
    return BACKUP_CONTENT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(snapshot, key));
}

function assertSupportedBackup(snapshot: Record<string, unknown>) {
    const version = snapshot.schemaVersion;

    if (
        version !== undefined &&
        version !== BACKUP_SCHEMA_VERSION &&
        version !== String(BACKUP_SCHEMA_VERSION)
    ) {
        throw new Error('Unsupported backup version.');
    }

    if (!hasRecognizedBackupContent(snapshot)) {
        throw new Error('Invalid backup payload.');
    }
}

export function createBackupRepository(
    client: StorageClient,
    aiSecrets?: Pick<AiSecretStorageModule, 'clearAiApiKey'>
): BackupRepository {
    return {
        async exportAll() {
            const raw = await client.get(BACKUP_KEYS);
            const proposalStatePatch = normalizeProposalStateBackupPatch(raw);

            return {
                schemaVersion: BACKUP_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                ...normalizeStoredStateSnapshot(raw),
                ...proposalStatePatch.setItems,
            };
        },
        async importAll(snapshot: unknown) {
            if (!snapshot || typeof snapshot !== 'object') {
                throw new Error('Invalid backup payload.');
            }

            const snapshotRecord = snapshot as Record<string, unknown>;
            assertSupportedBackup(snapshotRecord);
            const normalizedSnapshot = normalizeImportedState(snapshotRecord);
            const proposalStatePatch = normalizeProposalStateBackupPatch(snapshotRecord);

            if (proposalStatePatch.removeKeys.length > 0) {
                await client.remove(proposalStatePatch.removeKeys);
            }

            await client.set({
                ...normalizedSnapshot,
                ...proposalStatePatch.setItems,
            });

            await aiSecrets?.clearAiApiKey();
        },
    };
}
