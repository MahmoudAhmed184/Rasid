import type { JobRecord, TrackedProject } from '../../entities/job/model';
import type { ExtensionStats } from '../../features/monitoring/model';
import type { PromptTemplate } from '../../entities/prompt/model';
import type { RuntimeState } from '../../entities/runtime/model';
import { DEFAULT_MONITORED_PLATFORMS, type ExtensionSettings } from '../../entities/settings/model';
import { DEFAULT_SIGNALR_URL } from '../../features/realtime/constants';

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

export const MAX_SEEN_JOBS = 500;
export const MAX_RECENT_JOBS = 50;

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
المرفقات: {attachments}

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
    monitoredPlatforms: { ...DEFAULT_MONITORED_PLATFORMS },
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
