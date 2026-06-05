const ARABIC_MONTHS: Record<string, number> = {
    يناير: 0,
    فبراير: 1,
    مارس: 2,
    أبريل: 3,
    مايو: 4,
    يونيو: 5,
    يوليو: 6,
    أغسطس: 7,
    سبتمبر: 8,
    أكتوبر: 9,
    نوفمبر: 10,
    ديسمبر: 11,
};

const KHAMSAT_GMT_DATE_PATTERN =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s+GMT$/i;

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

export function parseArabicDate(value: string | null | undefined): Date | null {
    if (!value) {
        return null;
    }

    const parts = value.trim().split(/\s+/);

    if (parts.length < 3) {
        return null;
    }

    const day = Number(parts[0]);
    const month = ARABIC_MONTHS[parts[1] ?? ''];
    const year = Number(parts[2]);

    if (!Number.isFinite(day) || !Number.isFinite(year) || typeof month === 'undefined') {
        return null;
    }

    return new Date(year, month, day);
}

export function parseJobPostedAt(value: string | null | undefined): Date | null {
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

    const timestamp = Date.parse(trimmed);
    if (Number.isFinite(timestamp)) {
        return new Date(timestamp);
    }

    return parseArabicDate(trimmed);
}

export function calculateArabicDateAgeDays(
    value: string | null | undefined,
    now: Date = new Date()
): number {
    const parsed = parseArabicDate(value);

    if (!parsed) {
        return -1;
    }

    const diff = Math.abs(now.getTime() - parsed.getTime());
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
