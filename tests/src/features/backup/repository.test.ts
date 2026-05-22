import { describe, expect, it } from 'vitest';

import { createBackupRepository } from '../../../../src/features/backup/repository';
import { readJsonFixture } from '../../../support/fixtures';
import { createMemoryStorage } from '../../../support/fake-storage';

describe('backup repository', () => {
    it('adds schema metadata and strips persistent AI keys from exports', async () => {
        const repository = createBackupRepository(
            createMemoryStorage({
                settings: {
                    aiApiKey: 'secret',
                    interval: 5,
                },
                pendingChatGptPrompt: {
                    prompt: 'stale',
                },
            })
        );

        const backup = await repository.exportAll();

        expect(backup.schemaVersion).toBe(1);
        expect(typeof backup.exportedAt).toBe('string');
        expect((backup.settings as { aiApiKey?: string }).aiApiKey).toBe('');
        expect(Object.hasOwn(backup, 'pendingChatGptPrompt')).toBe(false);
    });

    it('rejects unsupported versions and clears the current AI secret during import', async () => {
        const storage = createMemoryStorage();
        let cleared = false;
        const repository = createBackupRepository(storage, {
            async clearAiApiKey() {
                cleared = true;
            },
        });

        await expect(repository.importAll({ schemaVersion: 2, settings: {} })).rejects.toThrow(
            /Unsupported backup version/
        );

        await repository.importAll(readJsonFixture('backup', 'minimal-v1.json'));

        const snapshot = await storage.get(['settings']);
        expect((snapshot.settings as { aiApiKey?: string }).aiApiKey).toBe('');
        expect(cleared).toBe(true);
    });
});
