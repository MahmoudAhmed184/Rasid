import type { AiProviderId } from './ai';

export type NotificationMode = 'auto' | 'signalr' | 'polling';
export type JobCategory = 'development' | 'ai' | 'all';
export type AiExecutionMode = 'bridge' | 'direct';
export type SignalRStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'polling'
    | 'backoff'
    | 'suspended';

export interface PromptTemplate {
    id: string;
    title: string;
    content: string;
}

export interface JobRecord {
    id: string;
    title: string;
    url: string;
    budget?: string;
    description?: string;
    duration?: string;
    hiringRate?: string;
    registrationDate?: string;
    status?: string;
    communications?: string;
    poster?: string;
    time?: string;
    postedAt?: string;
    bidsText?: string;
    category?: string;
    tags?: string[];
    clientName?: string;
    clientType?: string;
}

export interface TrackedProject {
    title: string;
    url: string;
    status?: string;
    communications?: string;
    lastChecked?: string;
}

export interface ExtensionSettings {
    systemEnabled: boolean;
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
    signalrServerUrl: string;
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

export interface ExtensionStats {
    lastCheck: string | null;
    todayCount: number;
    todayDate: string;
}

export interface SignalRState {
    status: SignalRStatus;
    instanceId: string | null;
    connectionId: string | null;
    serverUrl: string;
    isFallbackActive: boolean;
    reconnectAttempt: number;
    lastConnectedAt: string | null;
    lastDisconnectedAt: string | null;
    lastDisconnectReason: string | null;
    lastEventAt: string | null;
    nextReconnectAt: string | null;
    leaseExpiresAt: string | null;
}

export interface RuntimeState {
    signalr: SignalRState;
    lastPollingReason: string | null;
}

export interface StoredNotificationPayload {
    url: string;
    jobId?: string;
}

export interface StoredState {
    settings: ExtensionSettings;
    seenJobs: string[];
    recentJobs: JobRecord[];
    stats: ExtensionStats;
    trackedProjects: Record<string, TrackedProject>;
    prompts: PromptTemplate[];
    proposalTemplate: string;
    notificationsEnabled: boolean;
    runtime: RuntimeState;
}

export const DEFAULT_SIGNALR_URL = 'https://frelancia.runasp.net/jobNotificationHub';
export const MAX_SEEN_JOBS = 500;
export const MAX_RECENT_JOBS = 50;
export const SIGNALR_HEALTH_INTERVAL_MINUTES = 1;
export const SIGNALR_LEASE_WINDOW_MS = 4.5 * 60 * 1000;
export const SIGNALR_LEASE_WINDOW_MINUTES = SIGNALR_LEASE_WINDOW_MS / 60000;
export const SIGNALR_RECONNECT_DELAY_MINUTES = 1;

export const ALARM_NAMES = {
    jobPolling: 'jobs:poll',
    signalrHealth: 'signalr:health',
    signalrLease: 'signalr:lease',
    signalrReconnect: 'signalr:reconnect',
} as const;

export const MOSTAQL_FEEDS: Record<JobCategory, string> = {
    development: 'https://mostaql.com/projects?category=development&sort=latest',
    ai: 'https://mostaql.com/projects?category=ai-machine-learning&sort=latest',
    all: 'https://mostaql.com/projects?sort=latest',
};

export const DEFAULT_PROMPTS: PromptTemplate[] = [
    {
        id: 'default_proposal',
        title: 'كتابة عرض مشروع',
        content: `أريد مساعدتك في كتابة عرض لهذا المشروع على منصة مستقل.

عنوان المشروع: {title}
القسم: {category}

تفاصيل المشروع:
الميزانية: {budget}
مدة التنفيذ: {duration}
تاريخ النشر: {publish_date}
الوسوم: {tags}

معلومات صاحب العمل:
الاسم: {client_name} ({client_type})

رابط المشروع: {url}

وصف المشروع:
{description}

يرجى كتابة عرض احترافي ومقنع يوضح خبرتي في هذا المجال ويشرح كيف يمكنني تنفيذ المطلوب بدقة، مع مراعاة تفاصيل المشروع ومتطلبات العميل.`,
    },
];

export const DEFAULT_PROPOSAL_TEMPLATE = `اطلعت على مشروعك وفهمت متطلباته جيدا، واذا انني قادر على تقديم العمل بطريقة منظمة وواضحة. احرص على الدقة لضمان ان تكون النتيجة مرضية تماما لك.

متحمس لبدء التعاون معك، واذاك بتنفيذ العمل بشكل سلس ومرتب. في انتظار تواصلك لترتيب التفاصيل والانطلاق مباشرة.`;

export const DEFAULT_SETTINGS: ExtensionSettings = {
    systemEnabled: true,
    development: true,
    ai: true,
    all: true,
    sound: true,
    aiExecutionMode: 'bridge',
    aiProvider: 'openai',
    aiModel: '',
    aiApiKey: '',
    aiSystemPrompt: '',
    interval: 1,
    notificationMode: 'auto',
    signalrServerUrl: '',
    aiChatUrl: 'https://chatgpt.com/',
    minBudget: 0,
    minHiringRate: 0,
    keywordsInclude: '',
    keywordsExclude: '',
    maxDuration: 0,
    minClientAge: 0,
    quietHoursEnabled: false,
    quietHoursStart: '00:00',
    quietHoursEnd: '00:00',
};

export const DEFAULT_STATS: ExtensionStats = {
    lastCheck: null,
    todayCount: 0,
    todayDate: new Date().toDateString(),
};

export const DEFAULT_RUNTIME_STATE: RuntimeState = {
    signalr: {
        status: 'idle',
        instanceId: null,
        connectionId: null,
        serverUrl: DEFAULT_SIGNALR_URL,
        isFallbackActive: false,
        reconnectAttempt: 0,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastDisconnectReason: null,
        lastEventAt: null,
        nextReconnectAt: null,
        leaseExpiresAt: null,
    },
    lastPollingReason: null,
};

export function clampPollingInterval(value: unknown): number {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return DEFAULT_SETTINGS.interval;
    }

    return Math.max(1, Math.min(30, Math.trunc(numeric)));
}
