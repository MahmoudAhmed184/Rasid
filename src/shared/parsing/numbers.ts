function normalizeNumerals(text: string): string {
    return text
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
}

function extractNumericValues(value: string | null | undefined): number[] {
    if (!value) {
        return [];
    }

    const normalized = normalizeNumerals(value)
        .replace(/\u066B/g, '.')
        .replace(/[,\u066C]/g, '')
        .replace(/(?<=\d)\u060C(?=\d)/g, '');
    const matches = normalized.match(/\d+(\.\d+)?/g);

    if (!matches) {
        return [];
    }

    return matches
        .map((match) => Number.parseFloat(match))
        .filter((number) => Number.isFinite(number));
}

export function parseBudgetFloor(budgetText: string | null | undefined): number {
    const values = extractNumericValues(budgetText);
    return values.length > 0 ? Math.min(...values) : 0;
}

export function parseBudgetCeiling(budgetText: string | null | undefined): number {
    const values = extractNumericValues(budgetText);
    return values.length > 0 ? Math.max(...values) : 0;
}

export function parseHiringRate(rateText: string | null | undefined): number {
    if (!rateText || rateText.includes('بعد')) {
        return 0;
    }

    return extractNumericValues(rateText)[0] ?? 0;
}
