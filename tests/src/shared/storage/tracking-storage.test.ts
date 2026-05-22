import { describe, expect, it } from 'vitest';

import {
    createTrackingStorage,
    normalizeTrackedProjects,
} from '../../../../src/shared/storage/modules/tracking-storage';
import { createMemoryStorage } from '../../../support/fake-storage';

describe('tracking storage', () => {
    it('normalizes tracked project records from qualified keys and safe URLs', () => {
        const projects = normalizeTrackedProjects({
            'mostaql:123': {
                title: 'مشروع مستقل',
                url: 'https://mostaql.com/project/123-test',
                attachments: [
                    { name: 'spec.pdf', url: 'https://mostaql.com/files/spec.pdf' },
                    { name: 123, url: '' },
                ],
            },
            'bad-empty-url': {
                id: 'bad',
                platformId: 'khamsat',
                title: 'missing url',
                url: '',
            },
            'nafezly:555': {
                id: '',
                title: 'نفذلي',
                url: 'https://nafezly.com/project/555',
                status: 42,
                tags: 'TypeScript',
            },
        });

        expect(projects).toEqual({
            'mostaql:123': expect.objectContaining({
                id: '123',
                platformId: 'mostaql',
                title: 'مشروع مستقل',
                url: 'https://mostaql.com/project/123-test',
                attachments: [{ name: 'spec.pdf', url: 'https://mostaql.com/files/spec.pdf' }],
            }),
            'nafezly:555': expect.objectContaining({
                id: '555',
                platformId: 'nafezly',
                status: undefined,
                tags: 'TypeScript',
            }),
        });
    });

    it('returns cloned project records so callers cannot mutate persisted state', async () => {
        const client = createMemoryStorage({
            trackedProjects: {
                'khamsat:7': {
                    id: '7',
                    platformId: 'khamsat',
                    title: 'خمسات',
                    url: 'https://khamsat.com/community/requests/7',
                    attachments: [
                        { name: 'brief.pdf', url: 'https://khamsat.com/files/brief.pdf' },
                    ],
                },
            },
        });
        const storage = createTrackingStorage(client);

        const firstRead = await storage.getTrackedProjects();
        firstRead['khamsat:7']!.title = 'mutated';
        firstRead['khamsat:7']!.attachments?.push({
            name: 'bad.pdf',
            url: 'https://evil.example/bad.pdf',
        });

        const secondRead = await storage.getTrackedProjects();
        expect(secondRead['khamsat:7']).toMatchObject({
            title: 'خمسات',
            attachments: [{ name: 'brief.pdf', url: 'https://khamsat.com/files/brief.pdf' }],
        });

        const persisted = await storage.setTrackedProjects({
            'mostaql:9': {
                id: '9',
                platformId: 'mostaql',
                title: 'مستقل',
                url: 'https://mostaql.com/project/9',
            },
        });
        persisted['mostaql:9']!.title = 'changed after write';

        await expect(storage.getTrackedProjects()).resolves.toMatchObject({
            'mostaql:9': {
                title: 'مستقل',
            },
        });
    });
});
