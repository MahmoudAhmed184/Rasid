import { describe, expect, it } from 'vitest';

import {
    getJobRecordKey,
    getTrackedProjectKey,
    parseQualifiedProjectKey,
} from '../../../../src/entities/job/identity';

describe('job and tracked project identity', () => {
    it('uses explicit platform ids when present', () => {
        expect(
            getJobRecordKey({ id: '123', platformId: 'khamsat', url: 'https://khamsat.com' })
        ).toBe('khamsat:123');
    });

    it('infers supported platform ids from URLs when legacy records omit them', () => {
        expect(getTrackedProjectKey({ id: '902', url: 'https://nafezly.com/project/902' })).toBe(
            'nafezly:902'
        );
    });

    it.each([
        ['valid', 'mostaql:123', { platformId: 'mostaql', id: '123' }],
        ['unknown platform', 'legacy:123', null],
        ['missing id', 'mostaql:', null],
        ['missing separator', 'mostaql', null],
    ] as const)('parses qualified project keys for %s cases', (_label, key, expected) => {
        expect(parseQualifiedProjectKey(key)).toEqual(expected);
    });
});
