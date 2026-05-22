import { describe, expect, it } from 'vitest';

import { normalizeJobRecord } from '../../../../src/features/monitoring/job-records';

describe('job record normalization', () => {
    it('normalizes supported records and infers platform ids from URLs', () => {
        expect(
            normalizeJobRecord({
                id: 123,
                title: 'مشروع',
                url: 'https://khamsat.com/community/requests/123',
                tags: ['برمجة', 42, ''],
            })
        ).toMatchObject({
            id: '123',
            platformId: 'khamsat',
            title: 'مشروع',
            tags: ['برمجة', '42'],
        });
    });

    it.each([
        ['missing title', { id: '1', url: 'https://mostaql.com/project/1' }],
        ['missing id', { title: 'x', url: 'https://mostaql.com/project/1' }],
        ['unsupported URL', { id: '1', title: 'x', url: 'https://legacy.example/project/1' }],
        ['non object', null],
    ] as const)('rejects %s records', (_label, value) => {
        expect(normalizeJobRecord(value)).toBeNull();
    });
});
