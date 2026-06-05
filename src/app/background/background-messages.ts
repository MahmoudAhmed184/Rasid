import { browser } from 'wxt/browser';

import type { JobBatchResult } from '../../features/monitoring/job-batch-publisher';
import type {
    GenerateProposalRequest,
    GenerateProposalResponse,
} from '../../features/proposals/proposal-contract';
import type { ZipDownloadResult, ZipEntryInput } from '../../features/downloads/zip-downloads';
import { normalizeAiChatUrl } from '../../entities/ai/chat-url';
import { isAllowedPlatformHostname } from '../../entities/platform/url';

export type OpenChatBridgePromptFailureReason =
    | 'permission-denied'
    | 'unsupported'
    | 'tab-open-failed'
    | 'injection-failed';

export type OpenChatBridgePromptResponse =
    | {
          readonly success: true;
          readonly tabId: number;
          readonly tabStatus: 'created' | 'focused';
          readonly injected: true;
      }
    | {
          readonly success: false;
          readonly reason: OpenChatBridgePromptFailureReason;
          readonly error?: string;
      };

export interface BackgroundMessageRequestMap {
    checkNow: {
        readonly action: 'checkNow';
    };
    testNotification: {
        readonly action: 'testNotification';
    };
    testSound: {
        readonly action: 'testSound';
    };
    updateAlarm: {
        readonly action: 'updateAlarm';
        readonly interval?: number;
    };
    reconnectSignalR: {
        readonly action: 'reconnectSignalR';
    };
    disconnectSignalR: {
        readonly action: 'disconnectSignalR';
    };
    debugFetch: {
        readonly action: 'debugFetch';
    };
    generateProposal: {
        readonly action: 'generateProposal';
        readonly templateId: GenerateProposalRequest['templateId'];
        readonly context: GenerateProposalRequest['context'];
    };
    openChatBridgePrompt: {
        readonly action: 'openChatBridgePrompt';
        readonly prompt: string;
        readonly chatUrl?: string;
    };
    downloadZip: {
        readonly action: 'downloadZip';
        readonly filename: string;
        readonly files: readonly ZipEntryInput[];
    };
}

export interface BackgroundMessageResponseMap {
    checkNow: JobBatchResult;
    testNotification: { readonly success: true };
    testSound: { readonly success: true };
    updateAlarm: { readonly success: true };
    reconnectSignalR: { readonly success: true };
    disconnectSignalR: { readonly success: true };
    debugFetch: { readonly success: boolean; readonly length?: number; readonly error?: string };
    generateProposal: GenerateProposalResponse;
    openChatBridgePrompt: OpenChatBridgePromptResponse;
    downloadZip: ZipDownloadResult;
}

export type BackgroundMessageAction = keyof BackgroundMessageRequestMap;

export type BackgroundRuntimeMessage = BackgroundMessageRequestMap[BackgroundMessageAction];

export type BackgroundMessageHandlerMap = {
    readonly [Action in BackgroundMessageAction]: (
        message: BackgroundMessageRequestMap[Action]
    ) => Promise<BackgroundMessageResponseMap[Action]> | BackgroundMessageResponseMap[Action];
};

export type BackgroundTransportResponse<
    Action extends BackgroundMessageAction = BackgroundMessageAction,
> =
    | {
          readonly ok: true;
          readonly action: Action;
          readonly data: BackgroundMessageResponseMap[Action];
      }
    | {
          readonly ok: false;
          readonly action: Action;
          readonly error: string;
      };

const BACKGROUND_ACTIONS: ReadonlySet<BackgroundMessageAction> = new Set([
    'checkNow',
    'testNotification',
    'testSound',
    'updateAlarm',
    'reconnectSignalR',
    'disconnectSignalR',
    'debugFetch',
    'generateProposal',
    'openChatBridgePrompt',
    'downloadZip',
]);
const MAX_ZIP_MESSAGE_FILES = 80;
const MAX_GENERATE_TEMPLATE_ID_LENGTH = 120;
const MAX_BRIDGE_PROMPT_LENGTH = 20_000;
const MAX_AI_CONTEXT_TITLE_LENGTH = 300;
const MAX_AI_CONTEXT_DESCRIPTION_LENGTH = 8_000;
const MAX_AI_CONTEXT_FIELD_LENGTH = 1_000;
const MAX_AI_CONTEXT_URL_LENGTH = 2_048;
const MAX_AI_CONTEXT_TAGS = 30;
const MAX_AI_CONTEXT_ATTACHMENTS = 10;
const AI_CONTEXT_URL_HOSTS = ['khamsat.com', 'mostaql.com', 'nafezly.com'] as const;

type Validator<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyAction(value: Record<string, unknown>, action: BackgroundMessageAction): boolean {
    return value.action === action;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isMonitoringErrors(value: unknown): value is Record<
    string,
    { readonly message: string; readonly failedAt: string }
> {
    if (!isRecord(value)) {
        return false;
    }

    return Object.values(value).every(
        (error) =>
            isRecord(error) &&
            typeof error.message === 'string' &&
            typeof error.failedAt === 'string'
    );
}

function isBoundedString(value: unknown, maxLength: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isOptionalBoundedString(value: unknown, maxLength: number): value is string | undefined {
    return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function isAllowedAiContextUrl(value: unknown): value is string {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        value.length > MAX_AI_CONTEXT_URL_LENGTH
    ) {
        return false;
    }

    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:' &&
            isAllowedPlatformHostname(url.hostname, AI_CONTEXT_URL_HOSTS)
        );
    } catch {
        return false;
    }
}

function isStringArray(value: unknown): value is string[] {
    return (
        Array.isArray(value) &&
        value.length <= MAX_AI_CONTEXT_TAGS &&
        value.every(
            (item) => typeof item === 'string' && item.length <= MAX_AI_CONTEXT_FIELD_LENGTH
        )
    );
}

function isProjectAttachment(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }

    return isBoundedString(value.name, 200) && isAllowedAiContextUrl(value.url);
}

function isAiRequestContext(value: unknown): value is GenerateProposalRequest['context'] {
    if (!isRecord(value)) {
        return false;
    }

    if (
        !isBoundedString(value.title, MAX_AI_CONTEXT_TITLE_LENGTH) ||
        !isBoundedString(value.description, MAX_AI_CONTEXT_DESCRIPTION_LENGTH)
    ) {
        return false;
    }

    const optionalStringFields = [
        'budget',
        'duration',
        'clientName',
        'clientType',
        'url',
        'category',
        'publishDate',
        'projectId',
        'projectStatus',
        'hiringRate',
        'openProjects',
        'underwayProjects',
        'clientJoined',
        'communications',
    ] as const;

    for (const field of optionalStringFields) {
        const maxLength = field === 'url' ? MAX_AI_CONTEXT_URL_LENGTH : MAX_AI_CONTEXT_FIELD_LENGTH;

        if (!isOptionalBoundedString(value[field], maxLength)) {
            return false;
        }
    }

    if (
        typeof value.url === 'string' &&
        value.url.length > 0 &&
        !isAllowedAiContextUrl(value.url)
    ) {
        return false;
    }

    if (
        value.tags !== undefined &&
        !(
            (typeof value.tags === 'string' && value.tags.length <= MAX_AI_CONTEXT_FIELD_LENGTH) ||
            isStringArray(value.tags)
        )
    ) {
        return false;
    }

    return (
        value.attachments === undefined ||
        (Array.isArray(value.attachments) &&
            value.attachments.length <= MAX_AI_CONTEXT_ATTACHMENTS &&
            value.attachments.every(isProjectAttachment))
    );
}

function isZipEntryInput(value: unknown): value is ZipEntryInput {
    if (!isRecord(value) || typeof value.name !== 'string') {
        return false;
    }

    return (
        (value.content === undefined || typeof value.content === 'string') &&
        (value.url === undefined || typeof value.url === 'string') &&
        (value.content !== undefined || value.url !== undefined)
    );
}

function isJobBatchResult(value: unknown): value is JobBatchResult {
    if (!isRecord(value)) {
        return false;
    }

    if (value.source !== 'signalr' && value.source !== 'polling') {
        return false;
    }

    if (!isFiniteNumber(value.totalChecked)) {
        return false;
    }

    switch (value.kind) {
        case 'noop':
            return (
                value.reason === 'system-disabled' ||
                value.reason === 'no-platforms' ||
                value.reason === 'no-new-jobs'
            );
        case 'failed':
            return value.reason === 'fetch-failed' && isMonitoringErrors(value.monitoringErrors);
        case 'suppressed':
            return isFiniteNumber(value.suppressed);
        case 'published':
            return isFiniteNumber(value.newJobs) && typeof value.notificationsSent === 'boolean';
        default:
            return false;
    }
}

function isSuccessResult(value: unknown): value is { readonly success: true } {
    return isRecord(value) && value.success === true;
}

function isDebugFetchResult(value: unknown): value is BackgroundMessageResponseMap['debugFetch'] {
    return (
        isRecord(value) &&
        typeof value.success === 'boolean' &&
        (value.length === undefined || isFiniteNumber(value.length)) &&
        (value.error === undefined || typeof value.error === 'string')
    );
}

function isGenerateProposalResponse(value: unknown): value is GenerateProposalResponse {
    if (!isRecord(value) || typeof value.success !== 'boolean') {
        return false;
    }

    if (!value.success) {
        return typeof value.error === 'string';
    }

    if (value.mode === 'direct') {
        return (
            typeof value.proposal === 'string' &&
            typeof value.provider === 'string' &&
            typeof value.model === 'string'
        );
    }

    return (
        value.mode === 'bridge' &&
        typeof value.prompt === 'string' &&
        value.chatUrl === normalizeAiChatUrl(value.chatUrl)
    );
}

function isOpenChatBridgePromptResponse(value: unknown): value is OpenChatBridgePromptResponse {
    if (!isRecord(value) || typeof value.success !== 'boolean') {
        return false;
    }

    if (value.success) {
        return (
            isFiniteNumber(value.tabId) &&
            (value.tabStatus === 'created' || value.tabStatus === 'focused') &&
            value.injected === true
        );
    }

    return (
        (value.reason === 'permission-denied' ||
            value.reason === 'unsupported' ||
            value.reason === 'tab-open-failed' ||
            value.reason === 'injection-failed') &&
        (value.error === undefined || typeof value.error === 'string')
    );
}

function isZipDownloadResult(value: unknown): value is ZipDownloadResult {
    if (!isRecord(value) || typeof value.success !== 'boolean') {
        return false;
    }

    return (
        (value.downloadId === undefined || isFiniteNumber(value.downloadId)) &&
        (value.error === undefined || typeof value.error === 'string')
    );
}

function isUpdateAlarmMessage(
    value: Record<string, unknown>
): value is BackgroundMessageRequestMap['updateAlarm'] {
    return (
        hasOnlyAction(value, 'updateAlarm') &&
        (value.interval === undefined || isFiniteNumber(value.interval))
    );
}

function isGenerateProposalMessage(
    value: Record<string, unknown>
): value is BackgroundMessageRequestMap['generateProposal'] {
    return (
        hasOnlyAction(value, 'generateProposal') &&
        typeof value.templateId === 'string' &&
        value.templateId.length > 0 &&
        value.templateId.length <= MAX_GENERATE_TEMPLATE_ID_LENGTH &&
        isAiRequestContext(value.context)
    );
}

function isOpenChatBridgePromptMessage(
    value: Record<string, unknown>
): value is BackgroundMessageRequestMap['openChatBridgePrompt'] {
    return (
        hasOnlyAction(value, 'openChatBridgePrompt') &&
        isBoundedString(value.prompt, MAX_BRIDGE_PROMPT_LENGTH) &&
        (value.chatUrl === undefined || value.chatUrl === normalizeAiChatUrl(value.chatUrl))
    );
}

function isDownloadZipMessage(
    value: Record<string, unknown>
): value is BackgroundMessageRequestMap['downloadZip'] {
    return (
        hasOnlyAction(value, 'downloadZip') &&
        typeof value.filename === 'string' &&
        value.filename.length > 0 &&
        Array.isArray(value.files) &&
        value.files.length <= MAX_ZIP_MESSAGE_FILES &&
        value.files.every(isZipEntryInput)
    );
}

const BACKGROUND_REQUEST_VALIDATORS: {
    readonly [Action in BackgroundMessageAction]: Validator<BackgroundMessageRequestMap[Action]>;
} = {
    checkNow: (value): value is BackgroundMessageRequestMap['checkNow'] =>
        isRecord(value) && hasOnlyAction(value, 'checkNow'),
    testNotification: (value): value is BackgroundMessageRequestMap['testNotification'] =>
        isRecord(value) && hasOnlyAction(value, 'testNotification'),
    testSound: (value): value is BackgroundMessageRequestMap['testSound'] =>
        isRecord(value) && hasOnlyAction(value, 'testSound'),
    updateAlarm: (value): value is BackgroundMessageRequestMap['updateAlarm'] =>
        isRecord(value) && isUpdateAlarmMessage(value),
    reconnectSignalR: (value): value is BackgroundMessageRequestMap['reconnectSignalR'] =>
        isRecord(value) && hasOnlyAction(value, 'reconnectSignalR'),
    disconnectSignalR: (value): value is BackgroundMessageRequestMap['disconnectSignalR'] =>
        isRecord(value) && hasOnlyAction(value, 'disconnectSignalR'),
    debugFetch: (value): value is BackgroundMessageRequestMap['debugFetch'] =>
        isRecord(value) && hasOnlyAction(value, 'debugFetch'),
    generateProposal: (value): value is BackgroundMessageRequestMap['generateProposal'] =>
        isRecord(value) && isGenerateProposalMessage(value),
    openChatBridgePrompt: (
        value
    ): value is BackgroundMessageRequestMap['openChatBridgePrompt'] =>
        isRecord(value) && isOpenChatBridgePromptMessage(value),
    downloadZip: (value): value is BackgroundMessageRequestMap['downloadZip'] =>
        isRecord(value) && isDownloadZipMessage(value),
};

const BACKGROUND_RESPONSE_VALIDATORS: {
    readonly [Action in BackgroundMessageAction]: Validator<BackgroundMessageResponseMap[Action]>;
} = {
    checkNow: isJobBatchResult,
    testNotification: isSuccessResult,
    testSound: isSuccessResult,
    updateAlarm: isSuccessResult,
    reconnectSignalR: isSuccessResult,
    disconnectSignalR: isSuccessResult,
    debugFetch: isDebugFetchResult,
    generateProposal: isGenerateProposalResponse,
    openChatBridgePrompt: isOpenChatBridgePromptResponse,
    downloadZip: isZipDownloadResult,
};

export function getBackgroundMessageAction(value: unknown): BackgroundMessageAction | null {
    if (!isRecord(value) || typeof value.action !== 'string') {
        return null;
    }

    return BACKGROUND_ACTIONS.has(value.action as BackgroundMessageAction)
        ? (value.action as BackgroundMessageAction)
        : null;
}

export function isBackgroundRuntimeMessage(value: unknown): value is BackgroundRuntimeMessage {
    const action = getBackgroundMessageAction(value);

    if (!action || !isRecord(value)) {
        return false;
    }

    return BACKGROUND_REQUEST_VALIDATORS[action](value);
}

export function isBackgroundTransportResponseForAction(
    value: unknown,
    action: BackgroundMessageAction
): value is BackgroundTransportResponse {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    if (candidate.action !== action || typeof candidate.ok !== 'boolean') {
        return false;
    }

    if (candidate.ok) {
        return BACKGROUND_RESPONSE_VALIDATORS[action](candidate.data);
    }

    return typeof candidate.error === 'string';
}

export function createBackgroundTransportSuccess<Action extends BackgroundMessageAction>(
    action: Action,
    data: BackgroundMessageResponseMap[Action]
): BackgroundTransportResponse<Action> {
    return {
        ok: true,
        action,
        data,
    };
}

export function createBackgroundTransportFailure<Action extends BackgroundMessageAction>(
    action: Action,
    error: string
): BackgroundTransportResponse<Action> {
    return {
        ok: false,
        action,
        error,
    };
}

export function dispatchBackgroundMessage(
    handlers: BackgroundMessageHandlerMap,
    message: BackgroundRuntimeMessage
):
    | Promise<BackgroundMessageResponseMap[BackgroundMessageAction]>
    | BackgroundMessageResponseMap[BackgroundMessageAction] {
    switch (message.action) {
        case 'checkNow':
            return handlers.checkNow(message);
        case 'testNotification':
            return handlers.testNotification(message);
        case 'testSound':
            return handlers.testSound(message);
        case 'updateAlarm':
            return handlers.updateAlarm(message);
        case 'reconnectSignalR':
            return handlers.reconnectSignalR(message);
        case 'disconnectSignalR':
            return handlers.disconnectSignalR(message);
        case 'debugFetch':
            return handlers.debugFetch(message);
        case 'generateProposal':
            return handlers.generateProposal(message);
        case 'openChatBridgePrompt':
            return handlers.openChatBridgePrompt(message);
        case 'downloadZip':
            return handlers.downloadZip(message);
    }
}

export async function sendBackgroundMessage<Action extends BackgroundMessageAction>(
    message: BackgroundMessageRequestMap[Action]
): Promise<BackgroundMessageResponseMap[Action]> {
    const response: unknown = await browser.runtime.sendMessage(message);

    if (!isBackgroundTransportResponseForAction(response, message.action)) {
        throw new Error(`Invalid background response for ${message.action}.`);
    }

    const transportResponse = response as BackgroundTransportResponse<Action>;

    if (!transportResponse.ok) {
        throw new Error(transportResponse.error);
    }

    return transportResponse.data;
}

export function requestCheckNow(): Promise<BackgroundMessageResponseMap['checkNow']> {
    return sendBackgroundMessage<'checkNow'>({ action: 'checkNow' });
}

export function requestTestNotification(): Promise<
    BackgroundMessageResponseMap['testNotification']
> {
    return sendBackgroundMessage<'testNotification'>({ action: 'testNotification' });
}

export function requestTestSound(): Promise<BackgroundMessageResponseMap['testSound']> {
    return sendBackgroundMessage<'testSound'>({ action: 'testSound' });
}

export function requestUpdateAlarm(
    interval?: number
): Promise<BackgroundMessageResponseMap['updateAlarm']> {
    return sendBackgroundMessage<'updateAlarm'>({ action: 'updateAlarm', interval });
}

export function requestReconnectSignalR(): Promise<
    BackgroundMessageResponseMap['reconnectSignalR']
> {
    return sendBackgroundMessage<'reconnectSignalR'>({ action: 'reconnectSignalR' });
}

export function requestDisconnectSignalR(): Promise<
    BackgroundMessageResponseMap['disconnectSignalR']
> {
    return sendBackgroundMessage<'disconnectSignalR'>({ action: 'disconnectSignalR' });
}

export function requestDebugFetch(): Promise<BackgroundMessageResponseMap['debugFetch']> {
    return sendBackgroundMessage<'debugFetch'>({ action: 'debugFetch' });
}

export function requestGenerateProposal(
    request: GenerateProposalRequest
): Promise<BackgroundMessageResponseMap['generateProposal']> {
    return sendBackgroundMessage<'generateProposal'>({
        action: 'generateProposal',
        templateId: request.templateId,
        context: request.context,
    });
}

export function requestOpenChatBridgePrompt(
    prompt: string,
    chatUrl?: string
): Promise<BackgroundMessageResponseMap['openChatBridgePrompt']> {
    return sendBackgroundMessage<'openChatBridgePrompt'>({
        action: 'openChatBridgePrompt',
        prompt,
        chatUrl: chatUrl ? normalizeAiChatUrl(chatUrl) : undefined,
    });
}

export function requestDownloadZip(
    filename: string,
    files: readonly ZipEntryInput[]
): Promise<BackgroundMessageResponseMap['downloadZip']> {
    return sendBackgroundMessage<'downloadZip'>({
        action: 'downloadZip',
        filename,
        files,
    });
}
