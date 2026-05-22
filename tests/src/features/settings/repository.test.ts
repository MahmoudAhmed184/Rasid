import { describe, expect, it, vi } from 'vitest';

import { createSettingsRepository } from '../../../../src/features/settings/repository';
import { DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';

describe('settings repository', () => {
    it('delegates reads, saves, and patches to extension storage', async () => {
        const storage = {
            getSettings: vi.fn(async () => DEFAULT_SETTINGS),
            updateSettings: vi.fn(async (patch) => ({
                ...DEFAULT_SETTINGS,
                ...patch,
            })),
        } satisfies Pick<ExtensionStorage, 'getSettings' | 'updateSettings'>;
        const repository = createSettingsRepository(storage as unknown as ExtensionStorage);

        await expect(repository.get()).resolves.toBe(DEFAULT_SETTINGS);
        await expect(repository.update({ interval: 5 })).resolves.toMatchObject({ interval: 5 });
        await expect(repository.save({ ...DEFAULT_SETTINGS, interval: 8 })).resolves.toMatchObject({
            interval: 8,
        });
        expect(storage.updateSettings).toHaveBeenCalledTimes(2);
    });
});
