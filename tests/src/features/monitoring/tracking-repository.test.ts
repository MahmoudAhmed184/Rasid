import { describe, expect, it, vi } from 'vitest';

import type { TrackedProject } from '../../../../src/entities/job/model';
import { createTrackingRepository } from '../../../../src/features/monitoring/tracking-repository';
import type { TrackedProjectRecord } from '../../../../src/platforms/contracts';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';

function createStorage(initial: Record<string, TrackedProject>) {
    let trackedProjects = { ...initial };

    return {
        getTrackedProjects: vi.fn(async () => trackedProjects),
        setTrackedProjects: vi.fn(async (next: Record<string, TrackedProject>) => {
            trackedProjects = { ...next };
            return trackedProjects;
        }),
    } satisfies Pick<ExtensionStorage, 'getTrackedProjects' | 'setTrackedProjects'>;
}

describe('tracking repository', () => {
    it('lists tracked projects, skips malformed records, and prefers qualified keys', async () => {
        const storage = createStorage({
            legacy: {
                id: '1',
                platformId: 'mostaql',
                title: 'Legacy title',
                url: 'https://mostaql.com/project/1',
            },
            'mostaql:1': {
                id: '1',
                platformId: 'mostaql',
                title: 'Qualified title',
                url: 'https://mostaql.com/project/1',
                attachments: [{ name: 'brief.pdf', url: 'https://mostaql.com/files/brief.pdf' }],
            },
            broken: {
                title: 'Missing URL',
                url: '',
            },
        });
        const repository = createTrackingRepository(storage as unknown as ExtensionStorage);

        const records = await repository.list();

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            id: '1',
            platformId: 'mostaql',
            title: 'Qualified title',
        });
        expect(records[0]?.attachments?.[0]).toEqual({
            name: 'brief.pdf',
            url: 'https://mostaql.com/files/brief.pdf',
        });
    });

    it('gets, checks, removes duplicate matches, and stores new tracked projects', async () => {
        const storage = createStorage({
            legacy: {
                id: '1',
                platformId: 'mostaql',
                title: 'Legacy title',
                url: 'https://mostaql.com/project/1',
            },
            'mostaql:1': {
                id: '1',
                platformId: 'mostaql',
                title: 'Qualified title',
                url: 'https://mostaql.com/project/1',
            },
        });
        const repository = createTrackingRepository(storage as unknown as ExtensionStorage);

        await expect(repository.isTracked('1', 'mostaql')).resolves.toBe(true);
        await expect(repository.get('1', 'mostaql')).resolves.toMatchObject({
            title: 'Legacy title',
        });
        await expect(
            repository.toggle({
                id: '1',
                platformId: 'mostaql',
                title: 'Qualified title',
                url: 'https://mostaql.com/project/1',
            })
        ).resolves.toBe('untracked');
        expect(storage.setTrackedProjects).toHaveBeenLastCalledWith({});

        const newRecord: TrackedProjectRecord = {
            id: '22',
            platformId: 'khamsat',
            title: 'خدمة جديدة',
            url: 'https://khamsat.com/community/requests/22',
            budget: '$100',
        };
        await expect(repository.toggle(newRecord)).resolves.toBe('tracked');
        expect(storage.setTrackedProjects).toHaveBeenLastCalledWith({
            'khamsat:22': expect.objectContaining({
                id: '22',
                platformId: 'khamsat',
                title: 'خدمة جديدة',
            }),
        });
    });
});
