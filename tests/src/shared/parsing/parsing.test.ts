import { describe, expect, it } from 'vitest';

import {
    calculateArabicDateAgeDays,
    parseArabicDate,
    parseJobPostedAt,
} from '../../../../src/shared/parsing/arabic-date';
import { parseDurationDays } from '../../../../src/shared/parsing/duration';
import {
    parseBudgetCeiling,
    parseBudgetFloor,
    parseHiringRate,
} from '../../../../src/shared/parsing/numbers';

describe('shared parsing helpers', () => {
    it.each([
        ['range dollars', '$100 - $250', 100, 250],
        ['arabic currency label', 'من 50 إلى 75 دولار', 50, 75],
        ['comma separated', '1,500 - 2,000 USD', 1500, 2000],
        ['empty', '', 0, 0],
        ['nullish', null, 0, 0],
    ] as const)('parses budget floor and ceiling for %s', (_label, value, floor, ceiling) => {
        expect(parseBudgetFloor(value)).toBe(floor);
        expect(parseBudgetCeiling(value)).toBe(ceiling);
    });

    it.each([
        ['percentage', '87%', 87],
        ['arabic text', 'معدل التوظيف 45%', 45],
        ['future signal text', 'بعد 10 مشاريع', 0],
        ['empty', undefined, 0],
    ] as const)('parses hiring rates for %s', (_label, value, expected) => {
        expect(parseHiringRate(value)).toBe(expected);
    });

    it.each([
        ['explicit days', '15 يوم', 15],
        ['single day phrase', 'يوم واحد', 1],
        ['arabic plural', '3 أيام', 3],
        ['hostile script text', '<script>999</script>', 999],
        ['missing', null, 0],
    ] as const)('parses duration days for %s', (_label, value, expected) => {
        expect(parseDurationDays(value)).toBe(expected);
    });

    it('parses Arabic dates and calculates deterministic ages', () => {
        expect(parseArabicDate('1 يناير 2026')?.getMonth()).toBe(0);
        expect(parseArabicDate('22 مايو 2026')?.getDate()).toBe(22);
        expect(parseArabicDate('  31   ديسمبر   2025  ')?.getMonth()).toBe(11);
        expect(parseArabicDate('bad input')).toBeNull();
        expect(parseArabicDate('22 Foo 2026')).toBeNull();
        expect(parseArabicDate('اليوم مايو 2026')).toBeNull();
        expect(parseArabicDate('22 مايو السنة')).toBeNull();
        expect(parseArabicDate(undefined)).toBeNull();
        expect(calculateArabicDateAgeDays('20 مايو 2026', new Date(2026, 4, 22))).toBe(2);
        expect(calculateArabicDateAgeDays('24 مايو 2026', new Date(2026, 4, 22))).toBe(2);
        expect(calculateArabicDateAgeDays('', new Date(2026, 4, 22))).toBe(-1);
    });

    it('parses Khamsat GMT sidebar dates as day-first UTC timestamps', () => {
        expect(parseJobPostedAt('05/06/2026 08:30 GMT')?.toISOString()).toBe(
            '2026-06-05T08:30:00.000Z'
        );
        expect(parseJobPostedAt('05/06/2026 GMT')?.toISOString()).toBe(
            '2026-06-05T00:00:00.000Z'
        );
        expect(parseJobPostedAt('31/02/2026 08:30 GMT')).toBeNull();
    });
});
