import { describe, expect, it } from 'vitest';

import type { JobRecord } from '../../../../src/entities/job/model';
import { DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import {
    applyJobFilters,
    evaluateJobFilters,
    isQuietHour,
} from '../../../../src/features/monitoring/job-filters';

const baseJob: JobRecord = {
    id: '1',
    platformId: 'mostaql',
    title: 'تطوير تطبيق TypeScript',
    url: 'https://mostaql.com/project/1',
    description: 'مشروع نظيف لبناء إضافة متصفح',
    budget: '$500 - $1000',
    hiringRate: '80%',
    duration: '10 أيام',
    registrationDate: '1 يناير 2025',
};

describe('monitoring job filters', () => {
    it('passes jobs that satisfy all configured thresholds', () => {
        expect(
            applyJobFilters(baseJob, {
                ...DEFAULT_SETTINGS,
                minBudget: 400,
                minHiringRate: 70,
                maxDuration: 10,
                keywordsInclude: 'typescript, extension',
                keywordsExclude: 'wordpress',
                minClientAge: 30,
            })
        ).toBe(true);
    });

    it('returns diagnostic failure codes for filtered jobs', () => {
        const diagnostic = evaluateJobFilters(
            baseJob,
            {
                ...DEFAULT_SETTINGS,
                minBudget: 1200,
                minHiringRate: 90,
                maxDuration: 5,
                keywordsInclude: 'python',
                keywordsExclude: 'متصفح',
                minClientAge: 1000,
            },
            new Date(2026, 4, 22)
        );

        expect(diagnostic.passed).toBe(false);
        expect(diagnostic.failures.map((failure) => failure.code)).toEqual([
            'min-budget',
            'min-hiring-rate',
            'include-keyword',
            'exclude-keyword',
            'max-duration',
            'min-client-age',
        ]);
    });

    it('handles quiet-hour windows that cross midnight', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            quietHoursStart: '22:00',
            quietHoursEnd: '06:00',
        };

        expect(isQuietHour(settings, new Date('2026-05-22T23:00:00'))).toBe(true);
        expect(isQuietHour(settings, new Date('2026-05-22T05:30:00'))).toBe(true);
        expect(isQuietHour(settings, new Date('2026-05-22T12:00:00'))).toBe(false);
    });
});
