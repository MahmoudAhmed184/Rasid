import type { JobRecord } from '../models/jobs';
import { isPlatformMonitoringEnabled, type ExtensionSettings } from '../models/settings';
import type { PlatformAdapter, PlatformId, PlatformMonitoringAdapter } from './contracts';
import type { PlatformMonitoringHtmlParser } from './monitoring-html-parser';
import { khamsatAdapter } from './khamsat/adapter';
import { parseKhamsatListingHtml, parseKhamsatProjectHtml } from './khamsat/html-parser';
import { createKhamsatMonitoringAdapter } from './khamsat/monitoring';
import { mostaqlAdapter } from './mostaql/adapter';
import { parseMostaqlListingHtml, parseMostaqlProjectHtml } from './mostaql/html-parser';
import { createMostaqlMonitoringAdapter } from './mostaql/monitoring';

export interface PlatformMonitoringHtmlParserEntry {
    parseListingHtml(html: string): JobRecord[];
    parseProjectHtml(html: string): Partial<JobRecord> | null;
}

export interface PlatformModule {
    readonly id: PlatformId;
    readonly content: PlatformAdapter;
    readonly realtime: {
        readonly supportsSignalR: boolean;
    };
    readonly monitoringParser: PlatformMonitoringHtmlParserEntry;
    createMonitoringAdapter(
        htmlParser: PlatformMonitoringHtmlParser
    ): PlatformMonitoringAdapter;
}

const PLATFORM_MODULES = {
    khamsat: {
        id: 'khamsat',
        content: khamsatAdapter,
        realtime: {
            supportsSignalR: true,
        },
        monitoringParser: {
            parseListingHtml: parseKhamsatListingHtml,
            parseProjectHtml: parseKhamsatProjectHtml,
        },
        createMonitoringAdapter: createKhamsatMonitoringAdapter,
    },
    mostaql: {
        id: 'mostaql',
        content: mostaqlAdapter,
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

type RegisteredPlatformModuleId = keyof typeof PLATFORM_MODULES;

function resolvePlatformModule(platformId: PlatformId): PlatformModule {
    const module = PLATFORM_MODULES[platformId as RegisteredPlatformModuleId];

    if (!module) {
        throw new Error(`Unknown platform module: ${platformId}`);
    }

    return module;
}

export function getPlatformModules(): readonly PlatformModule[] {
    return Object.values(PLATFORM_MODULES);
}

export function getPlatformModule(platformId: PlatformId): PlatformModule {
    return resolvePlatformModule(platformId);
}

export function getPlatformAdapter(platformId: PlatformId): PlatformAdapter {
    return getPlatformModule(platformId).content;
}

export function createPlatformMonitoringAdapters(
    htmlParser: PlatformMonitoringHtmlParser
): readonly PlatformMonitoringAdapter[] {
    return getPlatformModules().map((module) => module.createMonitoringAdapter(htmlParser));
}

export function getPlatformMonitoringAdapter(
    platformId: PlatformId,
    htmlParser: PlatformMonitoringHtmlParser
): PlatformMonitoringAdapter {
    return resolvePlatformModule(platformId).createMonitoringAdapter(htmlParser);
}

export function getPlatformMonitoringHtmlParser(
    platformId: PlatformId
): PlatformMonitoringHtmlParserEntry {
    return resolvePlatformModule(platformId).monitoringParser;
}

export function platformSupportsSignalR(platformId: PlatformId): boolean {
    return PLATFORM_MODULES[platformId as RegisteredPlatformModuleId]?.realtime.supportsSignalR ?? false;
}

export function hasEnabledSignalRPlatform(settings: Readonly<ExtensionSettings>): boolean {
    return getPlatformModules().some(
        (module) =>
            module.realtime.supportsSignalR && isPlatformMonitoringEnabled(settings, module.id)
    );
}
