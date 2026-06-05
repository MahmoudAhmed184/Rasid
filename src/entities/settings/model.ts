import type { AiProviderId } from '../ai/model';
import type { PlatformId } from '../platform/model';

export type NotificationMode = 'auto' | 'signalr' | 'polling';
export type AiExecutionMode = 'bridge' | 'direct';
export type MonitoredPlatforms = Record<PlatformId, boolean>;

export const DEFAULT_POLLING_INTERVAL = 1;
export const MIN_POLLING_INTERVAL = 1;
export const MAX_POLLING_INTERVAL = 30;
export const SUPPORTED_MONITORING_PLATFORM_IDS = ['mostaql', 'khamsat', 'nafezly'] as const;
export type SupportedMonitoringPlatformId = (typeof SUPPORTED_MONITORING_PLATFORM_IDS)[number];

export const DEFAULT_MONITORED_PLATFORMS: MonitoredPlatforms = {
    mostaql: true,
    khamsat: true,
    nafezly: true,
};

export interface ExtensionSettings {
    systemEnabled: boolean;
    monitoredPlatforms: MonitoredPlatforms;
    development: boolean;
    ai: boolean;
    all: boolean;
    sound: boolean;
    aiExecutionMode: AiExecutionMode;
    aiProvider: AiProviderId;
    aiModel: string;
    aiApiKey: string;
    aiSystemPrompt: string;
    interval: number;
    notificationMode: NotificationMode;
    aiChatUrl: string;
    minBudget: number;
    minHiringRate: number;
    keywordsInclude: string;
    keywordsExclude: string;
    maxDuration: number;
    minClientAge: number;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
}

export function clampPollingInterval(
    value: unknown,
    fallback: number = DEFAULT_POLLING_INTERVAL
): number {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return Math.max(MIN_POLLING_INTERVAL, Math.min(MAX_POLLING_INTERVAL, Math.trunc(numeric)));
}

export function isPlatformMonitoringEnabled(
    settings: Readonly<ExtensionSettings>,
    platformId: PlatformId
): boolean {
    return settings.monitoredPlatforms[platformId] !== false;
}
