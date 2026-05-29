import { browser, type PublicPath } from 'wxt/browser';
import type { JobRecord } from '../../entities/job/model';
import { isPlatformId, type PlatformId } from '../../entities/platform/model';

export type OffscreenTask =
    | 'audio.play-notification'
    | 'downloads.create-zip-url'
    | 'downloads.revoke-object-url'
    | 'monitoring.parse-listing-html'
    | 'monitoring.parse-project-html';

export interface OffscreenZipEntryInput {
    name: string;
    content?: string;
    url?: string;
}

export interface OffscreenZipObjectUrlResult {
    success: boolean;
    filename?: string;
    objectUrl?: string;
    error?: string;
}

export interface OffscreenSuccessResult {
    success: true;
}

export interface OffscreenTaskPayloadMap {
    'audio.play-notification': Record<string, never>;
    'downloads.create-zip-url': {
        filename: string;
        files: readonly OffscreenZipEntryInput[];
    };
    'downloads.revoke-object-url': {
        objectUrl: string;
    };
    'monitoring.parse-listing-html': {
        platformId: PlatformId;
        html: string;
    };
    'monitoring.parse-project-html': {
        platformId: PlatformId;
        html: string;
    };
}

export interface OffscreenTaskResultMap {
    'audio.play-notification': OffscreenSuccessResult;
    'downloads.create-zip-url': OffscreenZipObjectUrlResult;
    'downloads.revoke-object-url': OffscreenSuccessResult;
    'monitoring.parse-listing-html': readonly JobRecord[];
    'monitoring.parse-project-html': Partial<JobRecord> | null;
}

export type OffscreenTransportResponse<Task extends OffscreenTask = OffscreenTask> =
    | {
          task: Task;
          requestId: string;
          ok: true;
          data: OffscreenTaskResultMap[Task];
      }
    | {
          task: Task;
          requestId: string;
          ok: false;
          error: string;
      };

type LocalHandlerMap = {
    [Task in OffscreenTask]?: (
        payload: OffscreenTaskPayloadMap[Task]
    ) => Promise<OffscreenTaskResultMap[Task]> | OffscreenTaskResultMap[Task];
};

export type OffscreenTaskHandlerMap = {
    [Task in OffscreenTask]: (
        payload: OffscreenTaskPayloadMap[Task]
    ) => Promise<OffscreenTaskResultMap[Task]> | OffscreenTaskResultMap[Task];
};

type ExtensionHtmlPath = Extract<PublicPath, `${string}.html`>;
type ChromeApi = {
    offscreen?: {
        createDocument(options: {
            url: string;
            reasons: string[];
            justification: string;
        }): Promise<void>;
    };
    runtime: {
        getContexts?: (filter: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
    };
};

export type OffscreenTaskEnvelope<Task extends OffscreenTask = OffscreenTask> =
    Task extends OffscreenTask
        ? {
              channel: typeof OFFSCREEN_RPC_CHANNEL;
              source: 'background';
              requestId: string;
              task: Task;
              payload: OffscreenTaskPayloadMap[Task];
          }
        : never;

interface CreateOffscreenManagerOptions {
    mode: 'document' | 'local';
    documentPath: ExtensionHtmlPath;
    localHandlers?: LocalHandlerMap;
}

export interface OffscreenManager {
    bootstrap(): Promise<void>;
    request<Task extends OffscreenTask>(
        task: Task,
        payload: OffscreenTaskPayloadMap[Task]
    ): Promise<OffscreenTaskResultMap[Task]>;
    registerLocalHandler<Task extends OffscreenTask>(
        task: Task,
        handler: (
            payload: OffscreenTaskPayloadMap[Task]
        ) => Promise<OffscreenTaskResultMap[Task]> | OffscreenTaskResultMap[Task]
    ): void;
}

export const OFFSCREEN_RPC_CHANNEL = 'rasid:offscreen';
const OFFSCREEN_TASKS: ReadonlySet<OffscreenTask> = new Set([
    'audio.play-notification',
    'downloads.create-zip-url',
    'downloads.revoke-object-url',
    'monitoring.parse-listing-html',
    'monitoring.parse-project-html',
]);
const MAX_ZIP_TASK_FILES = 80;

function getChromeApi(): ChromeApi | null {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome ?? null;
}

function getOffscreenDocumentUrl(documentPath: ExtensionHtmlPath): string {
    return documentPath.startsWith('/') ? documentPath.slice(1) : documentPath;
}

function isOffscreenTask(value: unknown): value is OffscreenTask {
    return typeof value === 'string' && OFFSCREEN_TASKS.has(value as OffscreenTask);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNoFields(value: unknown): value is Record<string, never> {
    return isRecord(value) && Object.keys(value).length === 0;
}

function isZipEntryInput(value: unknown): value is OffscreenZipEntryInput {
    if (!isRecord(value) || typeof value.name !== 'string') {
        return false;
    }

    return (
        (value.content === undefined || typeof value.content === 'string') &&
        (value.url === undefined || typeof value.url === 'string') &&
        (value.content !== undefined || value.url !== undefined)
    );
}

function isZipPayload(
    value: unknown
): value is OffscreenTaskPayloadMap['downloads.create-zip-url'] {
    return (
        isRecord(value) &&
        typeof value.filename === 'string' &&
        value.filename.length > 0 &&
        Array.isArray(value.files) &&
        value.files.length <= MAX_ZIP_TASK_FILES &&
        value.files.every(isZipEntryInput)
    );
}

function isRevokePayload(
    value: unknown
): value is OffscreenTaskPayloadMap['downloads.revoke-object-url'] {
    return isRecord(value) && typeof value.objectUrl === 'string' && value.objectUrl.length > 0;
}

function isMonitoringHtmlPayload(
    value: unknown
): value is OffscreenTaskPayloadMap['monitoring.parse-listing-html'] {
    return isRecord(value) && isPlatformId(value.platformId) && typeof value.html === 'string';
}

function isPayloadForTask<Task extends OffscreenTask>(
    task: Task,
    payload: unknown
): payload is OffscreenTaskPayloadMap[Task] {
    switch (task) {
        case 'audio.play-notification':
            return hasNoFields(payload);
        case 'downloads.create-zip-url':
            return isZipPayload(payload);
        case 'downloads.revoke-object-url':
            return isRevokePayload(payload);
        case 'monitoring.parse-listing-html':
        case 'monitoring.parse-project-html':
            return isMonitoringHtmlPayload(payload);
    }
}

function isSuccessResult(value: unknown): value is OffscreenSuccessResult {
    return isRecord(value) && value.success === true;
}

function isZipObjectUrlResult(value: unknown): value is OffscreenZipObjectUrlResult {
    return (
        isRecord(value) &&
        typeof value.success === 'boolean' &&
        (value.filename === undefined || typeof value.filename === 'string') &&
        (value.objectUrl === undefined || typeof value.objectUrl === 'string') &&
        (value.error === undefined || typeof value.error === 'string')
    );
}

function isJobRecord(value: unknown): value is JobRecord {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        typeof value.title === 'string' &&
        typeof value.url === 'string'
    );
}

function isProjectParseResult(value: unknown): value is Partial<JobRecord> | null {
    return (
        value === null ||
        (isRecord(value) &&
            (value.id === undefined || typeof value.id === 'string') &&
            (value.title === undefined || typeof value.title === 'string') &&
            (value.url === undefined || typeof value.url === 'string'))
    );
}

function isResultForTask<Task extends OffscreenTask>(
    task: Task,
    data: unknown
): data is OffscreenTaskResultMap[Task] {
    switch (task) {
        case 'audio.play-notification':
        case 'downloads.revoke-object-url':
            return isSuccessResult(data);
        case 'downloads.create-zip-url':
            return isZipObjectUrlResult(data);
        case 'monitoring.parse-listing-html':
            return Array.isArray(data) && data.every(isJobRecord);
        case 'monitoring.parse-project-html':
            return isProjectParseResult(data);
    }
}

export function isOffscreenProtocolMessage(value: unknown): value is OffscreenTaskEnvelope {
    if (!isRecord(value)) {
        return false;
    }

    return (
        value.channel === OFFSCREEN_RPC_CHANNEL &&
        value.source === 'background' &&
        typeof value.requestId === 'string' &&
        value.requestId.length > 0 &&
        isOffscreenTask(value.task) &&
        isPayloadForTask(value.task, value.payload)
    );
}

export function isOffscreenTransportResponseForTask(
    value: unknown,
    task: OffscreenTask,
    requestId: string
): value is OffscreenTransportResponse {
    if (!isRecord(value)) {
        return false;
    }

    if (value.task !== task || value.requestId !== requestId || typeof value.ok !== 'boolean') {
        return false;
    }

    if (value.ok) {
        return isResultForTask(task, value.data);
    }

    return typeof value.error === 'string';
}

export function createOffscreenTransportSuccess<Task extends OffscreenTask>(
    task: Task,
    data: OffscreenTaskResultMap[Task],
    requestId: string
): OffscreenTransportResponse<Task> {
    return {
        task,
        requestId,
        ok: true,
        data,
    };
}

export function createOffscreenTransportFailure<Task extends OffscreenTask>(
    task: Task,
    error: string,
    requestId: string
): OffscreenTransportResponse<Task> {
    return {
        task,
        requestId,
        ok: false,
        error,
    };
}

export function dispatchOffscreenTask(
    handlers: OffscreenTaskHandlerMap,
    message: OffscreenTaskEnvelope
): Promise<OffscreenTaskResultMap[OffscreenTask]> | OffscreenTaskResultMap[OffscreenTask] {
    switch (message.task) {
        case 'audio.play-notification':
            return handlers['audio.play-notification'](message.payload);
        case 'downloads.create-zip-url':
            return handlers['downloads.create-zip-url'](message.payload);
        case 'downloads.revoke-object-url':
            return handlers['downloads.revoke-object-url'](message.payload);
        case 'monitoring.parse-listing-html':
            return handlers['monitoring.parse-listing-html'](message.payload);
        case 'monitoring.parse-project-html':
            return handlers['monitoring.parse-project-html'](message.payload);
    }
}

export function createOffscreenManager(options: CreateOffscreenManagerOptions): OffscreenManager {
    const chromeApi = getChromeApi();
    const localHandlers: LocalHandlerMap = {
        ...(options.localHandlers ?? {}),
    };

    let creatingDocument: Promise<void> | null = null;

    async function hasChromeOffscreenDocument(): Promise<boolean> {
        if (!chromeApi?.runtime.getContexts) {
            return false;
        }

        const contexts = await chromeApi.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [browser.runtime.getURL(options.documentPath)],
        });

        return contexts.length > 0;
    }

    async function ensureChromeOffscreenDocument(): Promise<void> {
        if (options.mode !== 'document' || !chromeApi?.offscreen) {
            return;
        }

        if (await hasChromeOffscreenDocument()) {
            return;
        }

        if (!creatingDocument) {
            creatingDocument = chromeApi.offscreen
                .createDocument({
                    url: getOffscreenDocumentUrl(options.documentPath),
                    // Chrome requires an explicit reason list; audio + HTML parsing are the only offscreen duties here.
                    reasons: ['AUDIO_PLAYBACK', 'BLOBS', 'DOM_PARSER'],
                    justification:
                        'Rasid uses an MV3 offscreen document for audio playback, generated ZIP downloads, and platform HTML parsing while the service worker remains suspendable.',
                })
                .finally(() => {
                    creatingDocument = null;
                });
        }

        await creatingDocument;
    }

    async function dispatchLocal<Task extends OffscreenTask>(
        task: Task,
        payload: OffscreenTaskPayloadMap[Task]
    ): Promise<OffscreenTaskResultMap[Task]> {
        const handler = localHandlers[task];

        if (!handler) {
            throw new Error(`No local offscreen handler registered for ${task}.`);
        }

        return handler(payload);
    }

    async function bootstrap(): Promise<void> {
        if (options.mode === 'document') {
            await ensureChromeOffscreenDocument();
        }
    }

    async function request<Task extends OffscreenTask>(
        task: Task,
        payload: OffscreenTaskPayloadMap[Task]
    ): Promise<OffscreenTaskResultMap[Task]> {
        if (options.mode === 'local') {
            return dispatchLocal(task, payload);
        }

        await ensureChromeOffscreenDocument();
        const requestId =
            typeof globalThis.crypto?.randomUUID === 'function'
                ? globalThis.crypto.randomUUID()
                : `${Date.now()}:${Math.random()}`;

        const envelope = {
            channel: OFFSCREEN_RPC_CHANNEL,
            source: 'background',
            requestId,
            task,
            payload,
        } as OffscreenTaskEnvelope<Task>;

        const response: unknown = await browser.runtime.sendMessage(envelope);

        if (!isOffscreenTransportResponseForTask(response, task, requestId)) {
            throw new Error(`Invalid offscreen response for ${task}.`);
        }

        const transportResponse = response as OffscreenTransportResponse<Task>;

        if (!transportResponse.ok) {
            throw new Error(transportResponse.error);
        }

        return transportResponse.data;
    }

    function registerLocalHandler<Task extends OffscreenTask>(
        task: Task,
        handler: (
            payload: OffscreenTaskPayloadMap[Task]
        ) => Promise<OffscreenTaskResultMap[Task]> | OffscreenTaskResultMap[Task]
    ): void {
        localHandlers[task] = handler as LocalHandlerMap[Task];
    }

    return {
        bootstrap,
        request,
        registerLocalHandler,
    };
}
