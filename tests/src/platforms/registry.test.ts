import { describe, expect, it } from 'vitest';

import { PLATFORM_IDS } from '../../../src/platforms/platform-ids';
import type { PlatformId } from '../../../src/entities/platform/model';
import type { PlatformMonitoringHtmlParser } from '../../../src/platforms/monitoring-html-parser';
import {
    createPlatformMonitoringAdapters,
    getPlatformModules,
    getPlatformMonitoringHtmlParser,
    hasEnabledSignalRPlatform,
} from '../../../src/platforms/registry';
import { DEFAULT_SETTINGS } from '../../../src/shared/storage/schema';

describe('platform registry', () => {
    it('registers only the shipped supported platforms', () => {
        expect(PLATFORM_IDS).toEqual(['mostaql', 'khamsat', 'nafezly']);
        expect(
            getPlatformModules()
                .map((module) => module.id)
                .sort()
        ).toEqual(['khamsat', 'mostaql', 'nafezly']);
    });

    it('creates monitoring adapters and resolves SignalR eligibility only for enabled shipped platforms', () => {
        const htmlParser: PlatformMonitoringHtmlParser = {
            parseListingHtml: async () => [],
            parseProjectHtml: async () => null,
        };

        expect(createPlatformMonitoringAdapters(htmlParser).map((adapter) => adapter.id)).toEqual([
            'khamsat',
            'nafezly',
            'mostaql',
        ]);
        expect(hasEnabledSignalRPlatform(DEFAULT_SETTINGS)).toBe(true);
        expect(
            hasEnabledSignalRPlatform({
                ...DEFAULT_SETTINGS,
                monitoredPlatforms: {
                    mostaql: false,
                    khamsat: false,
                    nafezly: false,
                },
            })
        ).toBe(false);
    });

    it('rejects unsupported platform parser lookups', () => {
        expect(() => getPlatformMonitoringHtmlParser('legacy' as PlatformId)).toThrow(
            'Unknown platform module'
        );
    });
});
