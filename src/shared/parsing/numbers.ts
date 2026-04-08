function extractNumericValues(value: string | null | undefined): number[] {
    if (!value) {
        return [];
    }

    const matches = value.replace(/,/g, '').match(/\d+(\.\d+)?/g);

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
