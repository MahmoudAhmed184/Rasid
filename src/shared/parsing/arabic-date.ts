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
