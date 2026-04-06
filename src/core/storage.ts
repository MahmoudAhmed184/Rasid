import { browser } from 'wxt/browser';

import {
    DEFAULT_PROMPTS,
    DEFAULT_PROPOSAL_TEMPLATE,
    DEFAULT_RUNTIME_STATE,
    DEFAULT_SETTINGS,
    DEFAULT_SIGNALR_URL,
    DEFAULT_STATS,
    MAX_RECENT_JOBS,
    MAX_SEEN_JOBS,
    clampPollingInterval,
    type ExtensionSettings,
    type ExtensionStats,
    type JobRecord,
    type PromptTemplate,
    type RuntimeState,
    type SignalRState,
    type SignalRStatus,
    type StoredNotificationPayload,
    type StoredState,
    type TrackedProject,
} from '../models/extension';

function normalizeAiExecutionMode(value: unknown): 'bridge' | 'direct' {
    return value === 'direct' ? 'direct' : 'bridge';
}

function normalizeAiProvider(value: unknown): 'openai' | 'gemini' | 'claude' {
    if (value === 'gemini' || value === 'claude') {
        return value;
    }

    return 'openai';
}

const STORAGE_FIELDS = {
    settings: 'settings',
    seenJobs: 'seenJobs',
    recentJobs: 'recentJobs',
    stats: 'stats',
    trackedProjects: 'trackedProjects',
    prompts: 'prompts',
    proposalTemplate: 'proposalTemplate',
    notificationsEnabled: 'notificationsEnabled',
    runtime: 'runtime',
} as const;

const SNAPSHOT_KEYS = Object.values(STORAGE_FIELDS) as Array<keyof StoredState>;
const NOTIFICATION_KEY_PREFIX = 'notification:';
const SIGNALR_STATUSES: ReadonlySet<SignalRStatus> = new Set([
    'idle',
    'connecting',
    'connected',
    'polling',
    'backoff',
    'suspended',
]);

interface IngestedJobsResult {
    newJobs: JobRecord[];
    seenJobs: string[];
    recentJobs: JobRecord[];
    stats: ExtensionStats;
    settings: ExtensionSettings;
    notificationsEnabled: boolean;
}

export interface ExtensionStorage {
    ensureDefaults(): Promise<StoredState>;
    getSnapshot(): Promise<StoredState>;
    getSettings(): Promise<ExtensionSettings>;
    updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings>;
    getRuntimeState(): Promise<RuntimeState>;
    patchRuntimeState(patch: Partial<RuntimeState>): Promise<RuntimeState>;
    setSignalRState(patch: Partial<SignalRState>): Promise<SignalRState>;
    ingestJobs(jobs: JobRecord[]): Promise<IngestedJobsResult>;
    mergeRecentJobs(jobs: JobRecord[]): Promise<JobRecord[]>;
    touchLastCheck(reason: string): Promise<ExtensionStats>;
    storeNotificationPayload(
        notificationId: string,
        payload: StoredNotificationPayload
    ): Promise<void>;
    consumeNotificationPayload(notificationId: string): Promise<StoredNotificationPayload | null>;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function jsonEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function clonePrompts(value: readonly PromptTemplate[]): PromptTemplate[] {
    return value.map((prompt) => ({ ...prompt }));
}

function normalizeText(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function normalizeOptionalText(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isSignalRStatus(value: unknown): value is SignalRStatus {
    return typeof value === 'string' && SIGNALR_STATUSES.has(value as SignalRStatus);
}

function isStoredNotificationPayload(value: unknown): value is StoredNotificationPayload {
    return (
        isObject(value) &&
        typeof value.url === 'string' &&
        value.url.length > 0 &&
        (typeof value.jobId === 'undefined' || typeof value.jobId === 'string')
    );
}

function normalizeSettings(value: unknown): ExtensionSettings {
    if (!isObject(value)) {
        return { ...DEFAULT_SETTINGS };
    }

    return {
        ...DEFAULT_SETTINGS,
        ...value,
        aiExecutionMode: normalizeAiExecutionMode(value.aiExecutionMode),
        aiProvider: normalizeAiProvider(value.aiProvider),
        aiModel: typeof value.aiModel === 'string' ? value.aiModel.trim() : '',
        aiApiKey: typeof value.aiApiKey === 'string' ? value.aiApiKey.trim() : '',
        aiSystemPrompt: typeof value.aiSystemPrompt === 'string' ? value.aiSystemPrompt : '',
        interval: clampPollingInterval(value.interval),
        signalrServerUrl:
            typeof value.signalrServerUrl === 'string' ? value.signalrServerUrl.trim() : '',
        aiChatUrl:
            typeof value.aiChatUrl === 'string' && value.aiChatUrl.length > 0
                ? value.aiChatUrl
                : DEFAULT_SETTINGS.aiChatUrl,
    };
}

function normalizeStats(value: unknown): ExtensionStats {
    if (!isObject(value)) {
        return { ...DEFAULT_STATS };
    }

    return {
        lastCheck: typeof value.lastCheck === 'string' ? value.lastCheck : null,
        todayCount: Number.isFinite(value.todayCount) ? Number(value.todayCount) : 0,
        todayDate:
            typeof value.todayDate === 'string' && value.todayDate.length > 0
                ? value.todayDate
                : new Date().toDateString(),
    };
}

function normalizeSignalRState(value: unknown): SignalRState {
    if (!isObject(value)) {
        return { ...DEFAULT_RUNTIME_STATE.signalr };
    }

    return {
        ...DEFAULT_RUNTIME_STATE.signalr,
        ...value,
        status: isSignalRStatus(value.status)
            ? value.status
            : DEFAULT_RUNTIME_STATE.signalr.status,
        instanceId: typeof value.instanceId === 'string' ? value.instanceId : null,
        connectionId: typeof value.connectionId === 'string' ? value.connectionId : null,
        serverUrl:
            typeof value.serverUrl === 'string' && value.serverUrl.length > 0
                ? value.serverUrl
                : DEFAULT_SIGNALR_URL,
        isFallbackActive: value.isFallbackActive === true,
        reconnectAttempt: Number.isFinite(value.reconnectAttempt)
            ? Math.max(0, Number(value.reconnectAttempt))
            : 0,
        lastConnectedAt: typeof value.lastConnectedAt === 'string' ? value.lastConnectedAt : null,
        lastDisconnectedAt:
            typeof value.lastDisconnectedAt === 'string' ? value.lastDisconnectedAt : null,
        lastDisconnectReason:
            typeof value.lastDisconnectReason === 'string' ? value.lastDisconnectReason : null,
        lastEventAt: typeof value.lastEventAt === 'string' ? value.lastEventAt : null,
        nextReconnectAt: typeof value.nextReconnectAt === 'string' ? value.nextReconnectAt : null,
        leaseExpiresAt: typeof value.leaseExpiresAt === 'string' ? value.leaseExpiresAt : null,
    };
}

function normalizeRuntime(value: unknown): RuntimeState {
    if (!isObject(value)) {
        return {
            ...DEFAULT_RUNTIME_STATE,
            signalr: { ...DEFAULT_RUNTIME_STATE.signalr },
        };
    }

    return {
        ...DEFAULT_RUNTIME_STATE,
        ...value,
        signalr: normalizeSignalRState(value.signalr),
        lastPollingReason:
            typeof value.lastPollingReason === 'string' ? value.lastPollingReason : null,
    };
}

function normalizeJob(value: unknown): JobRecord | null {
    if (!isObject(value)) {
        return null;
    }

    const id = normalizeText(value.id);
    const title = normalizeText(value.title);
    const url = normalizeText(value.url);

    if (!id || !title || !url) {
        return null;
    }

    return {
        id,
        title,
        url,
        budget: normalizeOptionalText(value.budget),
        description: normalizeOptionalText(value.description),
        duration: normalizeOptionalText(value.duration),
        hiringRate: normalizeOptionalText(value.hiringRate),
        registrationDate: normalizeOptionalText(value.registrationDate),
        status: normalizeOptionalText(value.status),
        communications: normalizeOptionalText(value.communications),
        poster: normalizeOptionalText(value.poster),
        time: normalizeOptionalText(value.time),
        postedAt: normalizeOptionalText(value.postedAt),
        bidsText: normalizeOptionalText(value.bidsText),
        category: normalizeOptionalText(value.category),
        clientName: normalizeOptionalText(value.clientName),
        clientType: normalizeOptionalText(value.clientType),
        tags: Array.isArray(value.tags)
            ? value.tags.map((tag) => String(tag)).filter(Boolean)
            : undefined,
    };
}

function normalizeJobs(value: unknown): JobRecord[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((job) => normalizeJob(job))
        .filter((job): job is JobRecord => Boolean(job));
}

function normalizePrompts(value: unknown): PromptTemplate[] {
    if (!Array.isArray(value)) {
        return clonePrompts(DEFAULT_PROMPTS);
    }

    return value
        .filter((prompt): prompt is Record<string, unknown> => isObject(prompt))
        .map((prompt) => ({
            id: normalizeText(prompt.id),
            title: normalizeText(prompt.title),
            content: normalizeText(prompt.content),
        }))
        .filter((prompt) => prompt.id.length > 0 && prompt.title.length > 0);
}

function normalizeTrackedProjects(value: unknown): Record<string, TrackedProject> {
    if (!isObject(value)) {
        return {};
    }

    const trackedProjects = Object.entries(value)
        .map(([id, project]) => {
            const record = isObject(project) ? project : {};

            return [
                id,
                {
                    title: normalizeText(record.title),
                    url: normalizeText(record.url),
                    status: normalizeOptionalText(record.status),
                    communications: normalizeOptionalText(record.communications),
                    lastChecked: normalizeOptionalText(record.lastChecked),
                },
            ] as const;
        })
        .filter(([, project]) => project.url.length > 0);

    return Object.fromEntries(trackedProjects);
}

function sortJobs(jobs: JobRecord[]): JobRecord[] {
    return [...jobs].sort((left, right) => {
        const leftId = Number(left.id);
        const rightId = Number(right.id);

        if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
            return rightId - leftId;
        }

        return right.url.localeCompare(left.url);
    });
}

function normalizeSnapshot(value: Record<string, unknown>): StoredState {
    return {
        settings: normalizeSettings(value.settings),
        seenJobs: Array.isArray(value.seenJobs)
            ? value.seenJobs.map((item) => String(item)).filter(Boolean).slice(-MAX_SEEN_JOBS)
            : [],
        recentJobs: sortJobs(normalizeJobs(value.recentJobs)).slice(0, MAX_RECENT_JOBS),
        stats: normalizeStats(value.stats),
        trackedProjects: normalizeTrackedProjects(value.trackedProjects),
        prompts: normalizePrompts(value.prompts),
        proposalTemplate:
            typeof value.proposalTemplate === 'string'
                ? value.proposalTemplate
                : DEFAULT_PROPOSAL_TEMPLATE,
        notificationsEnabled: value.notificationsEnabled !== false,
        runtime: normalizeRuntime(value.runtime),
    };
}

function resetDailyStats(stats: ExtensionStats): ExtensionStats {
    if (stats.todayDate === new Date().toDateString()) {
        return stats;
    }

    return {
        ...stats,
        todayCount: 0,
        todayDate: new Date().toDateString(),
    };
}

function mergeJobs(existing: JobRecord[], incoming: JobRecord[]): JobRecord[] {
    const jobsById = new Map(existing.map((job) => [job.id, job]));

    for (const job of incoming) {
        if (!job.id) {
            continue;
        }

        jobsById.set(job.id, {
            ...jobsById.get(job.id),
            ...job,
        });
    }

    return sortJobs([...jobsById.values()]).slice(0, MAX_RECENT_JOBS);
}

export function createExtensionStorage(): ExtensionStorage {
    async function readSnapshotFields(): Promise<Record<string, unknown>> {
        return (await browser.storage.local.get(SNAPSHOT_KEYS)) as Record<string, unknown>;
    }

    async function writePatch(patch: Partial<StoredState>): Promise<void> {
        if (Object.keys(patch).length === 0) {
            return;
        }

        await browser.storage.local.set(patch);
    }

    async function getSnapshot(): Promise<StoredState> {
        return normalizeSnapshot(await readSnapshotFields());
    }

    async function ensureDefaults(): Promise<StoredState> {
        const raw = await readSnapshotFields();
        const normalized = normalizeSnapshot(raw);
        const patchEntries: Array<[keyof StoredState, StoredState[keyof StoredState]]> = [];

        for (const key of SNAPSHOT_KEYS) {
            const rawValue = raw[key];
            const normalizedValue = normalized[key];

            if (!jsonEqual(rawValue, normalizedValue)) {
                patchEntries.push([key, normalizedValue]);
            }
        }

        const patch = Object.fromEntries(patchEntries) as Partial<StoredState>;
        await writePatch(patch);
        return normalized;
    }

    async function getSettings(): Promise<ExtensionSettings> {
        const response = await browser.storage.local.get(STORAGE_FIELDS.settings);
        return normalizeSettings(response[STORAGE_FIELDS.settings]);
    }

    async function updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
        const current = await getSettings();
        const next = normalizeSettings({ ...current, ...patch });
        await browser.storage.local.set({ [STORAGE_FIELDS.settings]: next });
        return next;
    }

    async function getRuntimeState(): Promise<RuntimeState> {
        const response = await browser.storage.local.get(STORAGE_FIELDS.runtime);
        return normalizeRuntime(response[STORAGE_FIELDS.runtime]);
    }

    async function patchRuntimeState(patch: Partial<RuntimeState>): Promise<RuntimeState> {
        const current = await getRuntimeState();
        const next = normalizeRuntime({
            ...current,
            ...patch,
            signalr: {
                ...current.signalr,
                ...(patch.signalr ?? {}),
            },
        });

        await browser.storage.local.set({ [STORAGE_FIELDS.runtime]: next });
        return next;
    }

    async function setSignalRState(patch: Partial<SignalRState>): Promise<SignalRState> {
        const currentRuntime = await getRuntimeState();
        const nextSignalR = normalizeSignalRState({
            ...currentRuntime.signalr,
            ...patch,
        });

        await browser.storage.local.set({
            [STORAGE_FIELDS.runtime]: {
                ...currentRuntime,
                signalr: nextSignalR,
            },
        });

        return nextSignalR;
    }

    async function ingestJobs(jobs: JobRecord[]): Promise<IngestedJobsResult> {
        const snapshot = await getSnapshot();
        const seenJobs = new Set(snapshot.seenJobs);
        const newJobs: JobRecord[] = [];

        for (const job of jobs) {
            if (!job.id) {
                continue;
            }

            if (seenJobs.has(job.id)) {
                continue;
            }

            seenJobs.add(job.id);
            newJobs.push(job);
        }

        const recentJobs = mergeJobs(snapshot.recentJobs, jobs);
        const stats = resetDailyStats(snapshot.stats);
        stats.lastCheck = new Date().toISOString();
        stats.todayCount += newJobs.length;

        const nextSeenJobs = [...seenJobs].slice(-MAX_SEEN_JOBS);

        await browser.storage.local.set({
            [STORAGE_FIELDS.seenJobs]: nextSeenJobs,
            [STORAGE_FIELDS.recentJobs]: recentJobs,
            [STORAGE_FIELDS.stats]: stats,
        });

        return {
            newJobs,
            seenJobs: nextSeenJobs,
            recentJobs,
            stats,
            settings: snapshot.settings,
            notificationsEnabled: snapshot.notificationsEnabled,
        };
    }

    async function mergeRecentJobs(jobs: JobRecord[]): Promise<JobRecord[]> {
        const response = await browser.storage.local.get(STORAGE_FIELDS.recentJobs);
        const currentJobs = sortJobs(normalizeJobs(response[STORAGE_FIELDS.recentJobs]));
        const recentJobs = mergeJobs(currentJobs, jobs);

        await browser.storage.local.set({ [STORAGE_FIELDS.recentJobs]: recentJobs });
        return recentJobs;
    }

    async function touchLastCheck(reason: string): Promise<ExtensionStats> {
        const snapshot = await getSnapshot();
        const stats = resetDailyStats(snapshot.stats);
        stats.lastCheck = new Date().toISOString();

        await browser.storage.local.set({
            [STORAGE_FIELDS.stats]: stats,
            [STORAGE_FIELDS.runtime]: {
                ...snapshot.runtime,
                lastPollingReason: reason,
            },
        });

        return stats;
    }

    async function storeNotificationPayload(
        notificationId: string,
        payload: StoredNotificationPayload
    ): Promise<void> {
        await browser.storage.local.set({
            [`${NOTIFICATION_KEY_PREFIX}${notificationId}`]: payload,
        });
    }

    async function consumeNotificationPayload(
        notificationId: string
    ): Promise<StoredNotificationPayload | null> {
        const key = `${NOTIFICATION_KEY_PREFIX}${notificationId}`;
        const response = await browser.storage.local.get(key);
        await browser.storage.local.remove(key);

        return isStoredNotificationPayload(response[key]) ? response[key] : null;
    }

    return {
        ensureDefaults,
        getSnapshot,
        getSettings,
        updateSettings,
        getRuntimeState,
        patchRuntimeState,
        setSignalRState,
        ingestJobs,
        mergeRecentJobs,
        touchLastCheck,
        storeNotificationPayload,
        consumeNotificationPayload,
    };
}
