import { browser, type PublicPath } from 'wxt/browser';
import type { JobRecord } from '../../../entities/job/model';
import type { PlatformId } from '../../../platforms/contracts';

export type OffscreenTask =
    | 'audio.play-notification'
    | 'downloads.create-zip-url'
    | 'downloads.download-zip'
    | 'downloads.revoke-object-url'
    | 'monitoring.parse-listing-html'
    | 'monitoring.parse-project-html';

export interface OffscreenZipEntryInput {
    name: string;
    content?: string;
    url?: string;
}

export interface OffscreenZipDownloadResult {
    success: boolean;
    downloadId?: number;
    error?: string;
}

export interface OffscreenZipObjectUrlResult {
    success: boolean;
    filename?: string;
    objectUrl?: string;
    error?: string;
}

export interface OffscreenTaskPayloadMap {
    'audio.play-notification': {};
    'downloads.create-zip-url': {
        filename: string;
        files: readonly OffscreenZipEntryInput[];
    };
    'downloads.download-zip': {
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
    'audio.play-notification': void;
    'downloads.create-zip-url': OffscreenZipObjectUrlResult;
    'downloads.download-zip': OffscreenZipDownloadResult;
    'downloads.revoke-object-url': void;
    'monitoring.parse-listing-html': readonly JobRecord[];
    'monitoring.parse-project-html': Partial<JobRecord> | null;
}

export type OffscreenTransportResponse<Task extends OffscreenTask = OffscreenTask> =
    | {
          task: Task;
          ok: true;
          data: OffscreenTaskResultMap[Task];
      }
    | {
          task: Task;
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
    'downloads.download-zip',
    'downloads.revoke-object-url',
    'monitoring.parse-listing-html',
    'monitoring.parse-project-html',
]);

function getChromeApi(): ChromeApi | null {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome ?? null;
}

function getOffscreenDocumentUrl(documentPath: ExtensionHtmlPath): string {
    return documentPath.startsWith('/') ? documentPath.slice(1) : documentPath;
}

function isOffscreenTask(value: unknown): value is OffscreenTask {
    return typeof value === 'string' && OFFSCREEN_TASKS.has(value as OffscreenTask);
}

export function isOffscreenProtocolMessage(value: unknown): value is OffscreenTaskEnvelope {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
        candidate.channel === OFFSCREEN_RPC_CHANNEL &&
        candidate.source === 'background' &&
        isOffscreenTask(candidate.task)
    );
}

export function isOffscreenTransportResponseForTask(
    value: unknown,
    task: OffscreenTask
): value is OffscreenTransportResponse {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    if (candidate.task !== task || typeof candidate.ok !== 'boolean') {
        return false;
    }

    if (candidate.ok) {
        return 'data' in candidate;
    }

    return typeof candidate.error === 'string';
}

export function createOffscreenTransportSuccess<Task extends OffscreenTask>(
    task: Task,
    data: OffscreenTaskResultMap[Task]
): OffscreenTransportResponse<Task> {
    return {
        task,
        ok: true,
        data,
    };
}

export function createOffscreenTransportFailure<Task extends OffscreenTask>(
    task: Task,
    error: string
): OffscreenTransportResponse<Task> {
    return {
        task,
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
        case 'downloads.download-zip':
            return handlers['downloads.download-zip'](message.payload);
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

        return handler(payload) as Promise<OffscreenTaskResultMap[Task]>;
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

        const envelope = {
            channel: OFFSCREEN_RPC_CHANNEL,
            source: 'background',
            task,
            payload,
        } as OffscreenTaskEnvelope<Task>;

        const response = await browser.runtime.sendMessage(envelope);

        if (!isOffscreenTransportResponseForTask(response, task)) {
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
