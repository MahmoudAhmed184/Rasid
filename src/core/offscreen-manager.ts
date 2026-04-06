import { browser, type PublicPath } from 'wxt/browser';

export type OffscreenTask =
    | 'audio.play-notification'
    | 'dom.parse-jobs'
    | 'dom.parse-project-details';

export interface OffscreenTaskPayloadMap {
    'audio.play-notification': {};
    'dom.parse-jobs': {
        html: string;
    };
    'dom.parse-project-details': {
        html: string;
    };
}

export interface OffscreenTaskResultMap {
    'audio.play-notification': void;
    'dom.parse-jobs': unknown;
    'dom.parse-project-details': unknown;
}

type LocalHandlerMap = {
    [Task in OffscreenTask]?: (
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

export const OFFSCREEN_RPC_CHANNEL = 'frelancia:offscreen';

function getChromeApi(): ChromeApi | null {
    return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome ?? null;
}

function getOffscreenDocumentUrl(documentPath: ExtensionHtmlPath): string {
    return documentPath.startsWith('/') ? documentPath.slice(1) : documentPath;
}

export function isOffscreenProtocolMessage(value: unknown): value is OffscreenTaskEnvelope {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
        candidate.channel === OFFSCREEN_RPC_CHANNEL &&
        candidate.source === 'background' &&
        typeof candidate.task === 'string'
    );
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
                    // Chrome requires an explicit reason list; audio + DOM parsing are the only offscreen duties here.
                    reasons: ['AUDIO_PLAYBACK', 'DOM_PARSER'],
                    justification:
                        'Frelancia uses an MV3 offscreen document for audio playback and HTML parsing while the service worker remains suspendable.',
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

        return response as OffscreenTaskResultMap[Task];
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
