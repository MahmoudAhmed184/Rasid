import { expect } from 'vitest';

export function expectRecord(value: unknown): asserts value is Record<string, unknown> {
    expect(typeof value).toBe('object');
    expect(value).not.toBeNull();
    expect(Array.isArray(value)).toBe(false);
}

export function expectString(value: unknown): asserts value is string {
    expect(typeof value).toBe('string');
}
