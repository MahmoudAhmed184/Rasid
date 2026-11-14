function normalizeNumerals(text: string): string {
    return text
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
}

export function parseDurationDays(durationText: string | null | undefined): number {
    if (!durationText) {
        return 0;
    }

    const text = normalizeNumerals(String(durationText)).trim();
    const match = text.match(/\d+/);
    const amount = match ? Number.parseInt(match[0], 10) : null;

    if (text.includes('شهر') || text.includes('أشهر') || text.includes('شهور')) {
        if (amount !== null) {
            return amount * 30;
        }
        if (text.includes('شهران') || text.includes('شهرين')) {
            return 60;
        }
        return 30;
    }

    if (
        text.includes('أسبوع') ||
        text.includes('اسبوع') ||
        text.includes('أسابيع') ||
        text.includes('اسابيع')
    ) {
        if (amount !== null) {
            return amount * 7;
        }
        if (
            text.includes('أسبوعان') ||
            text.includes('اسبوعان') ||
            text.includes('أسبوعين') ||
            text.includes('اسبوعين')
        ) {
            return 14;
        }
        return 7;
    }

    if (amount !== null) {
        return amount;
    }

    if (text.includes('يومان') || text.includes('يومين')) {
        return 2;
    }

    return text.includes('يوم واحد') || text.includes('يوم') ? 1 : 0;
}
