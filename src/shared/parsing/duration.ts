export function parseDurationDays(durationText: string | null | undefined): number {
    if (!durationText) {
        return 0;
    }

    const text = String(durationText).trim();
    const match = text.match(/\d+/);

    if (match) {
        return Number.parseInt(match[0], 10);
    }

    return text.includes('يوم واحد') ? 1 : 0;
}
