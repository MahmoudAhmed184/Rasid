const ARABIC_MONTHS: Record<string, number> = {
    يناير: 0,
    'كانون الثاني': 0,
    جانفي: 0,
    فبراير: 1,
    شباط: 1,
    فيفري: 1,
    مارس: 2,
    آذار: 2,
    أبريل: 3,
    ابريل: 3,
    نيسان: 3,
    مايو: 4,
    أيار: 4,
    ايار: 4,
    ماي: 4,
    يونيو: 5,
    حزيران: 5,
    جوان: 5,
    يوليو: 6,
    تموز: 6,
    جويلية: 6,
    أغسطس: 7,
    اغسطس: 7,
    آب: 7,
    أوت: 7,
    اوت: 7,
    سبتمبر: 8,
    أيلول: 8,
    ايلول: 8,
    أكتوبر: 9,
    اكتوبر: 9,
    'تشرين الأول': 9,
    'تشرين الاول': 9,
    نوفمبر: 10,
    'تشرين الثاني': 10,
    ديسمبر: 11,
    'كانون الأول': 11,
    'كانون الاول': 11,
};

const KHAMSAT_GMT_DATE_PATTERN =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s+GMT$/i;

function normalizeNumerals(text: string): string {
    return text
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
}

function parseKhamsatGmtDate(value: string): Date | null {
    const match = value.match(KHAMSAT_GMT_DATE_PATTERN);

    if (!match) {
        return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4] ?? 0);
    const minute = Number(match[5] ?? 0);
    const second = Number(match[6] ?? 0);

    if (
        !Number.isInteger(day) ||
        !Number.isInteger(month) ||
        !Number.isInteger(year) ||
        !Number.isInteger(hour) ||
        !Number.isInteger(minute) ||
        !Number.isInteger(second)
    ) {
        return null;
    }

    const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
    const parsed = new Date(timestamp);

    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day ||
        parsed.getUTCHours() !== hour ||
        parsed.getUTCMinutes() !== minute ||
        parsed.getUTCSeconds() !== second
    ) {
        return null;
    }

    return parsed;
}

export function parseRelativeDurationMs(text: string): number | null {
    const normalized = normalizeNumerals(text).replace(/\s+/g, ' ').trim();

    if (!normalized) {
        return null;
    }

    // Strip leading "منذ" or "آخر تفاعل" or "قبل"
    let cleaned = normalized.replace(/^(?:آخر\s+تفاعل\s+(?:منذ?|قبل)?|منذ|قبل)\s*/i, '').trim();

    if (!cleaned) {
        return null;
    }

    if (/^(?:الآن|لحظات?|لحظة|ثوان(?:ية| معدودة|ي)?|قليل|أقل\s+من\s+دقيقة)$/i.test(cleaned)) {
        return 0;
    }

    // Strip leading approximation terms
    cleaned = cleaned
        .replace(/^(?:حوالي|قرابة|نحو|تقريبا|تقريباً|أقل\s+من|أكثر\s+من)\s*/i, '')
        .replace(/\s*(?:تقريبا|تقريباً)$/i, '')
        .trim();

    if (!cleaned) {
        return null;
    }

    // Standalone common phrases
    if (/^(?:نصف\s+ساعة)$/i.test(cleaned)) {
        return 30 * 60 * 1000;
    }
    if (/^(?:ربع\s+ساعة)$/i.test(cleaned)) {
        return 15 * 60 * 1000;
    }
    if (/^(?:ثلث\s+ساعة)$/i.test(cleaned)) {
        return 20 * 60 * 1000;
    }
    if (/^(?:نصف\s+دقيقة)$/i.test(cleaned)) {
        return 30 * 1000;
    }
    if (/^(?:بضع\s+ثوان(?:ية|ي)?)$/i.test(cleaned)) {
        return 15 * 1000;
    }
    if (/^(?:بضع\s+دقائق)$/i.test(cleaned)) {
        return 3 * 60 * 1000;
    }
    if (/^(?:بضع\s+ساعات)$/i.test(cleaned)) {
        return 3 * 60 * 60 * 1000;
    }
    if (/^(?:بضعة\s+أيام)$/i.test(cleaned)) {
        return 3 * 24 * 60 * 60 * 1000;
    }

    // Split on 'و' that separates compound units (e.g. "يوم و18 ساعة", "ساعة ونصف")
    const segments = cleaned.split(/(?<=\S)\s+و\s*(?=\S)/);
    let totalMs = 0;
    let matchedAny = false;
    let lastUnit: 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | null = null;

    for (const rawSegment of segments) {
        const segment = rawSegment.trim();
        if (!segment) {
            continue;
        }

        // Fractional words dependent on preceding unit
        if (/^(?:نصف|ونصف)$/i.test(segment)) {
            if (lastUnit === 'year') {
                totalMs += 182.5 * 24 * 60 * 60 * 1000;
                matchedAny = true;
                continue;
            }
            if (lastUnit === 'month') {
                totalMs += 15 * 24 * 60 * 60 * 1000;
                matchedAny = true;
                continue;
            }
            if (lastUnit === 'day') {
                totalMs += 12 * 60 * 60 * 1000;
                matchedAny = true;
                continue;
            }
            if (lastUnit === 'hour') {
                totalMs += 30 * 60 * 1000;
                matchedAny = true;
                continue;
            }
            if (lastUnit === 'minute') {
                totalMs += 30 * 1000;
                matchedAny = true;
                continue;
            }
        }
        if (/^(?:ربع|وربع)$/i.test(segment)) {
            if (lastUnit === 'day') {
                totalMs += 6 * 60 * 60 * 1000;
                matchedAny = true;
                continue;
            }
            if (lastUnit === 'hour') {
                totalMs += 15 * 60 * 1000;
                matchedAny = true;
                continue;
            }
            if (lastUnit === 'minute') {
                totalMs += 15 * 1000;
                matchedAny = true;
                continue;
            }
        }
        if (/^(?:ثلث|وثلث)$/i.test(segment)) {
            if (lastUnit === 'day') {
                totalMs += 8 * 60 * 60 * 1000;
                matchedAny = true;
                continue;
            }
            if (lastUnit === 'hour') {
                totalMs += 20 * 60 * 1000;
                matchedAny = true;
                continue;
            }
        }

        // Years
        if (/^(?:سنة|عام)$/i.test(segment)) {
            totalMs += 365 * 24 * 60 * 60 * 1000;
            lastUnit = 'year';
            matchedAny = true;
            continue;
        }
        if (/^(?:سنتان|سنتين|عامان|عامين)$/i.test(segment)) {
            totalMs += 2 * 365 * 24 * 60 * 60 * 1000;
            lastUnit = 'year';
            matchedAny = true;
            continue;
        }
        const yearMatch = segment.match(/^(\d+)\s*(?:سنة|سنوات|عام|أعوام)$/i);
        if (yearMatch) {
            totalMs += Number(yearMatch[1]) * 365 * 24 * 60 * 60 * 1000;
            lastUnit = 'year';
            matchedAny = true;
            continue;
        }

        // Months
        if (/^شهر$/i.test(segment)) {
            totalMs += 30 * 24 * 60 * 60 * 1000;
            lastUnit = 'month';
            matchedAny = true;
            continue;
        }
        if (/^(?:شهران|شهرين)$/i.test(segment)) {
            totalMs += 60 * 24 * 60 * 60 * 1000;
            lastUnit = 'month';
            matchedAny = true;
            continue;
        }
        const monthMatch = segment.match(/^(\d+)\s*(?:شهر|أشهر|شهور)$/i);
        if (monthMatch) {
            totalMs += Number(monthMatch[1]) * 30 * 24 * 60 * 60 * 1000;
            lastUnit = 'month';
            matchedAny = true;
            continue;
        }

        // Weeks
        if (/^أسبوع$/i.test(segment)) {
            totalMs += 7 * 24 * 60 * 60 * 1000;
            lastUnit = 'week';
            matchedAny = true;
            continue;
        }
        if (/^(?:أسبوعان|أسبوعين)$/i.test(segment)) {
            totalMs += 14 * 24 * 60 * 60 * 1000;
            lastUnit = 'week';
            matchedAny = true;
            continue;
        }
        const weekMatch = segment.match(/^(\d+)\s*(?:أسبوع|أسابيع)$/i);
        if (weekMatch) {
            totalMs += Number(weekMatch[1]) * 7 * 24 * 60 * 60 * 1000;
            lastUnit = 'week';
            matchedAny = true;
            continue;
        }

        // Days
        if (/^(?:يوم|أمس)$/i.test(segment)) {
            totalMs += 24 * 60 * 60 * 1000;
            lastUnit = 'day';
            matchedAny = true;
            continue;
        }
        if (/^(?:يومان|يومين)$/i.test(segment)) {
            totalMs += 48 * 60 * 60 * 1000;
            lastUnit = 'day';
            matchedAny = true;
            continue;
        }
        const dayMatch = segment.match(/^(\d+)\s*(?:يوم|أيام)$/i);
        if (dayMatch) {
            totalMs += Number(dayMatch[1]) * 24 * 60 * 60 * 1000;
            lastUnit = 'day';
            matchedAny = true;
            continue;
        }

        // Hours
        if (/^(?:نصف\s+ساعة)$/i.test(segment)) {
            totalMs += 30 * 60 * 1000;
            lastUnit = 'hour';
            matchedAny = true;
            continue;
        }
        if (/^(?:ربع\s+ساعة)$/i.test(segment)) {
            totalMs += 15 * 60 * 1000;
            lastUnit = 'hour';
            matchedAny = true;
            continue;
        }
        if (/^(?:ثلث\s+ساعة)$/i.test(segment)) {
            totalMs += 20 * 60 * 1000;
            lastUnit = 'hour';
            matchedAny = true;
            continue;
        }
        if (/^ساعة$/i.test(segment)) {
            totalMs += 60 * 60 * 1000;
            lastUnit = 'hour';
            matchedAny = true;
            continue;
        }
        if (/^(?:ساعتان|ساعتين)$/i.test(segment)) {
            totalMs += 2 * 60 * 60 * 1000;
            lastUnit = 'hour';
            matchedAny = true;
            continue;
        }
        const hourMatch = segment.match(/^(\d+)\s*(?:ساعة|ساعات)$/i);
        if (hourMatch) {
            totalMs += Number(hourMatch[1]) * 60 * 60 * 1000;
            lastUnit = 'hour';
            matchedAny = true;
            continue;
        }

        // Minutes
        if (/^(?:نصف\s+دقيقة)$/i.test(segment)) {
            totalMs += 30 * 1000;
            lastUnit = 'minute';
            matchedAny = true;
            continue;
        }
        if (/^دقيقة$/i.test(segment)) {
            totalMs += 60 * 1000;
            lastUnit = 'minute';
            matchedAny = true;
            continue;
        }
        if (/^(?:دقيقتان|دقيقتين)$/i.test(segment)) {
            totalMs += 2 * 60 * 1000;
            lastUnit = 'minute';
            matchedAny = true;
            continue;
        }
        const minuteMatch = segment.match(/^(\d+)\s*(?:دقيقة|دقائق)$/i);
        if (minuteMatch) {
            totalMs += Number(minuteMatch[1]) * 60 * 1000;
            lastUnit = 'minute';
            matchedAny = true;
            continue;
        }

        // Seconds
        if (/^ثانية$/i.test(segment)) {
            totalMs += 1000;
            matchedAny = true;
            continue;
        }
        if (/^(?:ثانيتان|ثانيتين)$/i.test(segment)) {
            totalMs += 2 * 1000;
            matchedAny = true;
            continue;
        }
        const secondMatch = segment.match(/^(\d+)\s*(?:ثانية|ثوان|ثواني)$/i);
        if (secondMatch) {
            totalMs += Number(secondMatch[1]) * 1000;
            matchedAny = true;
            continue;
        }
    }

    return matchedAny ? totalMs : null;
}

export function parseArabicDate(value: string | null | undefined): Date | null {
    if (!value) {
        return null;
    }

    const normalized = normalizeNumerals(value).trim();
    const parts = normalized.split(/\s+/);

    if (parts.length < 3) {
        return null;
    }

    const day = Number(parts[0]);
    if (!Number.isFinite(day)) {
        return null;
    }

    // Check for two-word months (e.g. "15 كانون الثاني 2026")
    if (parts.length >= 4) {
        const twoWordMonth = `${parts[1]} ${parts[2]}`;
        const monthIndex = ARABIC_MONTHS[twoWordMonth];
        const year = Number(parts[3]);
        if (typeof monthIndex !== 'undefined' && Number.isFinite(year)) {
            return new Date(year, monthIndex, day);
        }
    }

    // Single-word month (e.g. "15 يناير 2026")
    const month = ARABIC_MONTHS[parts[1] ?? ''];
    const year = Number(parts[2]);

    if (!Number.isFinite(year) || typeof month === 'undefined') {
        return null;
    }

    return new Date(year, month, day);
}

export function parseJobPostedAt(
    value: string | null | undefined,
    now: Date = new Date()
): Date | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const khamsatGmtDate = parseKhamsatGmtDate(trimmed);
    if (khamsatGmtDate) {
        return khamsatGmtDate;
    }

    // Mostaql date format: "YYYY-MM-DD HH:mm:ss" -> UTC
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) {
        const iso = `${trimmed.replace(/\s+/, 'T')}Z`;
        const timestamp = Date.parse(iso);
        if (Number.isFinite(timestamp)) {
            return new Date(timestamp);
        }
    }

    const timestamp = Date.parse(trimmed);
    if (Number.isFinite(timestamp)) {
        return new Date(timestamp);
    }

    const relativeMs = parseRelativeDurationMs(trimmed);
    if (relativeMs !== null) {
        return new Date(now.getTime() - relativeMs);
    }

    return parseArabicDate(trimmed);
}

export function calculateArabicDateAgeDays(
    value: string | null | undefined,
    now: Date = new Date()
): number {
    const parsed = parseArabicDate(value) ?? parseJobPostedAt(value, now);

    if (!parsed) {
        return -1;
    }

    const diff = Math.abs(now.getTime() - parsed.getTime());
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
