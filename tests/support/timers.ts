import { vi } from 'vitest';

export function useFixedSystemTime(isoTimestamp: string): Date {
    const now = new Date(isoTimestamp);

    vi.useFakeTimers();
    vi.setSystemTime(now);

    return now;
}
