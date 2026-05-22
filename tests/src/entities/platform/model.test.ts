import { describe, expect, it } from 'vitest';

import {
    getPlatformDisplayName,
    inferPlatformIdFromUrl,
    inferSupportedPlatformIdFromUrl,
    isPlatformId,
    PLATFORM_IDS,
    resolvePlatformId,
} from '../../../../src/entities/platform/model';

describe('platform model helpers', () => {
    it('recognizes only shipped platform identifiers', () => {
        expect(PLATFORM_IDS).toEqual(['mostaql', 'khamsat', 'nafezly']);
        expect(isPlatformId('mostaql')).toBe(true);
        expect(isPlatformId('legacy')).toBe(false);
        expect(isPlatformId(null)).toBe(false);
    });

    it('infers supported platforms from exact or subdomain marketplace URLs', () => {
        expect(inferSupportedPlatformIdFromUrl('https://mostaql.com/projects')).toBe('mostaql');
        expect(inferSupportedPlatformIdFromUrl('https://sub.khamsat.com/community')).toBe(
            'khamsat'
        );
        expect(inferSupportedPlatformIdFromUrl('https://nafezly.com/project/1')).toBe('nafezly');
        expect(inferSupportedPlatformIdFromUrl('https://evilkhamsat.com/project/1')).toBeNull();
        expect(inferSupportedPlatformIdFromUrl('not a url')).toBeNull();
        expect(inferSupportedPlatformIdFromUrl(undefined)).toBeNull();
    });

    it('resolves platform IDs from explicit values, URLs, and fallbacks', () => {
        expect(resolvePlatformId('khamsat')).toBe('khamsat');
        expect(resolvePlatformId('unknown', { url: 'https://nafezly.com/project/1' })).toBe(
            'nafezly'
        );
        expect(resolvePlatformId('unknown', { fallback: 'khamsat' })).toBe('khamsat');
        expect(inferPlatformIdFromUrl('https://example.com', 'nafezly')).toBe('nafezly');
    });

    it('returns Arabic display names for supported platforms', () => {
        expect(getPlatformDisplayName('mostaql')).toBe('مستقل');
        expect(getPlatformDisplayName('khamsat')).toBe('خمسات');
        expect(getPlatformDisplayName('nafezly')).toBe('نفذلي');
    });
});
