import { describe, expect, it } from 'vitest';

import {
    mergeJobs,
    normalizeAttachments,
    normalizeJob,
    normalizeJobs,
    sortJobs,
} from '../../../../src/shared/storage/modules/job-storage';

describe('job storage normalization', () => {
    it('normalizes supported jobs, infers platforms, and strips malformed attachments', () => {
        expect(
            normalizeJob({
                id: '123',
                title: 'مشروع',
                url: 'https://nafezly.com/project/123',
                attachments: [
                    { name: 'spec.pdf', url: 'https://nafezly.com/uploads/spec.pdf' },
                    { name: 'missing-url' },
                    'bad',
                ],
                tags: ['TypeScript', 42, ''],
            })
        ).toMatchObject({
            id: '123',
            platformId: 'nafezly',
            attachments: [{ name: 'spec.pdf', url: 'https://nafezly.com/uploads/spec.pdf' }],
            tags: ['TypeScript', '42'],
        });
    });

    it.each([
        ['non object', null],
        ['missing title', { id: '1', url: 'https://mostaql.com/project/1' }],
        ['unsupported URL', { id: '1', title: 'x', url: 'https://example.com/project/1' }],
    ] as const)('rejects %s values', (_label, value) => {
        expect(normalizeJob(value)).toBeNull();
    });

    it('normalizes arrays and sorts numeric IDs newest first', () => {
        expect(
            normalizeJobs([
                { id: '1', title: 'old', url: 'https://mostaql.com/project/1' },
                { id: '3', title: 'new', url: 'https://mostaql.com/project/3' },
                { id: '', title: 'bad', url: 'https://mostaql.com/project/4' },
            ]).map((job) => job.id)
        ).toEqual(['1', '3']);
        expect(
            sortJobs([
                { id: '1', platformId: 'mostaql', title: 'old', url: 'https://mostaql.com/1' },
                { id: '3', platformId: 'mostaql', title: 'new', url: 'https://mostaql.com/3' },
            ]).map((job) => job.id)
        ).toEqual(['3', '1']);
    });

    it('merges jobs by qualified platform key without cross-platform collisions', () => {
        const merged = mergeJobs(
            [
                {
                    id: '1',
                    platformId: 'mostaql',
                    title: 'old',
                    url: 'https://mostaql.com/project/1',
                    budget: '$100',
                },
            ],
            [
                {
                    id: '1',
                    platformId: 'mostaql',
                    title: 'updated',
                    url: 'https://mostaql.com/project/1',
                },
                {
                    id: '1',
                    platformId: 'khamsat',
                    title: 'different platform',
                    url: 'https://khamsat.com/community/requests/1',
                },
            ]
        );

        expect(merged).toHaveLength(2);
        expect(merged.find((job) => job.platformId === 'mostaql')).toMatchObject({
            title: 'updated',
            budget: '$100',
        });
    });

    it('returns undefined for empty attachment lists', () => {
        expect(normalizeAttachments([{ name: 'bad' }])).toBeUndefined();
    });
});
