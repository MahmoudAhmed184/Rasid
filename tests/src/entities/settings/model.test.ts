import { describe, expect, it } from 'vitest';

import {
    DEFAULT_MONITORED_PLATFORMS,
    SUPPORTED_MONITORING_PLATFORM_IDS,
    clampPollingInterval,
    isPlatformMonitoringEnabled,
} from '../../../../src/entities/settings/model';
import type { ExtensionSettings } from '../../../../src/entities/settings/model';
import { DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';

describe('settings entity model', () => {
    it.each([
        ['below minimum', -5, 1],
        ['fractional', 3.9, 3],
        ['above maximum', 999, 30],
        ['non numeric', 'nope', 1],
    ] as const)('clamps polling interval for %s', (_label, value, expected) => {
        expect(clampPollingInterval(value)).toBe(expected);
    });

    it('declares only shipped monitoring platforms', () => {
        expect(SUPPORTED_MONITORING_PLATFORM_IDS).toEqual(['mostaql', 'khamsat', 'nafezly']);
        expect(Object.keys(DEFAULT_MONITORED_PLATFORMS).sort()).toEqual([
            'khamsat',
            'mostaql',
            'nafezly',
        ]);
    });

    it('treats omitted platform flags as enabled for forward-compatible settings', () => {
        const settings: ExtensionSettings = {
            ...DEFAULT_SETTINGS,
            monitoredPlatforms: {
                mostaql: true,
                khamsat: false,
                nafezly: true,
            },
        };

        expect(isPlatformMonitoringEnabled(settings, 'mostaql')).toBe(true);
        expect(isPlatformMonitoringEnabled(settings, 'khamsat')).toBe(false);
    });
});
