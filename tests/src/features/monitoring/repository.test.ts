import { describe, expect, it, vi } from 'vitest';

import { createMonitoringRepository } from '../../../../src/features/monitoring/repository';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';
import {
    DEFAULT_RUNTIME_STATE,
    DEFAULT_SETTINGS,
    type StoredState,
} from '../../../../src/shared/storage/schema';

function createSnapshot(overrides: Partial<StoredState> = {}): StoredState {
    return {
        settings: DEFAULT_SETTINGS,
        seenJobs: ['mostaql:1', 'khamsat:2'],
        recentJobs: [],
        stats: {
            lastCheck: '2026-05-22T12:00:00.000Z',
            todayCount: 2,
            todayDate: new Date().toDateString(),
        },
        trackedProjects: {},
        prompts: [],
        proposalTemplate: '',
        notificationsEnabled: true,
        runtime: DEFAULT_RUNTIME_STATE,
        ...overrides,
    };
}

describe('monitoring repository', () => {
    it('builds an immutable overview from the storage snapshot', async () => {
        const snapshot = createSnapshot();
        const storage = {
            getSnapshot: vi.fn(async () => snapshot),
            getNotificationsEnabled: vi.fn(async () => snapshot.notificationsEnabled),
            setNotificationsEnabled: vi.fn(async (enabled: boolean) => enabled),
        } satisfies Pick<
            ExtensionStorage,
            'getSnapshot' | 'getNotificationsEnabled' | 'setNotificationsEnabled'
        >;
        const repository = createMonitoringRepository(storage as unknown as ExtensionStorage);

        const overview = await repository.getOverview();

        expect(overview).toMatchObject({
            stats: snapshot.stats,
            seenJobsCount: 2,
            notificationsEnabled: true,
            notificationMode: 'auto',
        });
        expect(overview.stats).not.toBe(snapshot.stats);
        expect(overview.runtime).not.toBe(snapshot.runtime);
        expect(overview.runtime.signalr).not.toBe(snapshot.runtime.signalr);
    });

    it('delegates notification toggles to storage', async () => {
        const storage = {
            getSnapshot: vi.fn(async () => createSnapshot()),
            getNotificationsEnabled: vi.fn(async () => false),
            setNotificationsEnabled: vi.fn(async (enabled: boolean) => enabled),
        } satisfies Pick<
            ExtensionStorage,
            'getSnapshot' | 'getNotificationsEnabled' | 'setNotificationsEnabled'
        >;
        const repository = createMonitoringRepository(storage as unknown as ExtensionStorage);

        await expect(repository.getNotificationsEnabled()).resolves.toBe(false);
        await expect(repository.setNotificationsEnabled(true)).resolves.toBe(true);
        expect(storage.setNotificationsEnabled).toHaveBeenCalledWith(true);
    });
});
