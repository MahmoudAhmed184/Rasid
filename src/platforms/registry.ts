import type { JobRecord } from '../entities/job/model';
import { isPlatformMonitoringEnabled, type ExtensionSettings } from '../entities/settings/model';
import type { PlatformId, PlatformMonitoringAdapter } from './contracts';
import type { PlatformMonitoringHtmlParser } from './monitoring-html-parser';
import { parseNafezlyListingHtml, parseNafezlyProjectHtml } from './nafezly/html-parser';
import { createNafezlyMonitoringAdapter } from './nafezly/monitoring';
import { parseKhamsatListingHtml, parseKhamsatProjectHtml } from './khamsat/html-parser';
import { createKhamsatMonitoringAdapter } from './khamsat/monitoring';
import { parseMostaqlListingHtml, parseMostaqlProjectHtml } from './mostaql/html-parser';
import { createMostaqlMonitoringAdapter } from './mostaql/monitoring';

export interface PlatformMonitoringHtmlParserEntry {
    parseListingHtml(html: string): JobRecord[];
    parseProjectHtml(html: string): Partial<JobRecord> | null;
}

export interface PlatformModule {
    readonly id: PlatformId;
    readonly realtime: {
        readonly supportsSignalR: boolean;
    };
    readonly monitoringParser: PlatformMonitoringHtmlParserEntry;
    createMonitoringAdapter(htmlParser: PlatformMonitoringHtmlParser): PlatformMonitoringAdapter;
}

const PLATFORM_MODULES = {
    khamsat: {
        id: 'khamsat',
        realtime: {
            supportsSignalR: true,
        },
        monitoringParser: {
            parseListingHtml: parseKhamsatListingHtml,
            parseProjectHtml: parseKhamsatProjectHtml,
        },
        createMonitoringAdapter: createKhamsatMonitoringAdapter,
    },
    nafezly: {
        id: 'nafezly',
        realtime: {
            supportsSignalR: true,
        },
        monitoringParser: {
            parseListingHtml: parseNafezlyListingHtml,
            parseProjectHtml: parseNafezlyProjectHtml,
        },
        createMonitoringAdapter: createNafezlyMonitoringAdapter,
    },
    mostaql: {
        id: 'mostaql',
        realtime: {
            supportsSignalR: true,
        },
        monitoringParser: {
            parseListingHtml: parseMostaqlListingHtml,
            parseProjectHtml: parseMostaqlProjectHtml,
        },
        createMonitoringAdapter: createMostaqlMonitoringAdapter,
    },
} as const satisfies Partial<Record<PlatformId, PlatformModule>>;

function resolvePlatformModule(platformId: PlatformId): PlatformModule {
    const module = PLATFORM_MODULES[platformId];

    if (!module) {
        throw new Error(`Unknown platform module: ${platformId}`);
    }

    return module;
}

export function getPlatformModules(): readonly PlatformModule[] {
    return Object.values(PLATFORM_MODULES);
}

export function createPlatformMonitoringAdapters(
    htmlParser: PlatformMonitoringHtmlParser
): readonly PlatformMonitoringAdapter[] {
    return getPlatformModules().map((module) => module.createMonitoringAdapter(htmlParser));
}

export function getPlatformMonitoringHtmlParser(
    platformId: PlatformId
): PlatformMonitoringHtmlParserEntry {
    return resolvePlatformModule(platformId).monitoringParser;
}

export function hasEnabledSignalRPlatform(settings: Readonly<ExtensionSettings>): boolean {
    return getPlatformModules().some(
        (module) =>
            module.realtime.supportsSignalR && isPlatformMonitoringEnabled(settings, module.id)
    );
}
