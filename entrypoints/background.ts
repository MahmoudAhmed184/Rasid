import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { createAiGateway, renderLegacyPromptTemplate } from '../src/core/ai';
import { createAudioService } from '../src/core/audio';
import { createDomService } from '../src/core/dom';
import { downloadZipArchive } from '../src/core/downloads';
import {
    createOffscreenManager,
    isOffscreenProtocolMessage,
} from '../src/core/offscreen-manager';
import { debugFetchMostaql, processRealtimeJobBatch, runPollingCycle } from '../src/core/jobs';
import { createNotificationService } from '../src/core/notifications';
import { createSignalRManager } from '../src/core/signalr';
import { createExtensionStorage } from '../src/core/storage';
import type { AiRequestContext } from '../src/models/ai';
import { DEFAULT_PROMPTS, type PromptTemplate } from '../src/models/extension';

const storage = createExtensionStorage();
const notifications = createNotificationService(storage);

// The service worker only orchestrates side effects. DOM parsing and audio stay in
// the offscreen/local abstraction so the worker remains MV3-safe and browser-neutral.
const offscreen = createOffscreenManager({
    mode: import.meta.env.CHROME ? 'document' : 'local',
    documentPath: '/offscreen.html',
});
const audio = createAudioService(offscreen);
const dom = createDomService(offscreen);

async function runPolling(reason: string) {
    return runPollingCycle({
        storage,
        notifyJobs: (jobs) => notifications.showJobsNotification(jobs),
        playNotificationSound: () => audio.playNotification(),
        reason,
        dom,
    });
}

const signalr = createSignalRManager({
    storage,
    onJobsReceived: async (jobs) => {
        await processRealtimeJobBatch({
            jobs,
            storage,
            notifyJobs: (batch) => notifications.showJobsNotification(batch),
            playNotificationSound: () => audio.playNotification(),
        });
    },
    onPollingFallback: async (reason) => {
        await runPolling(reason);
    },
});

type RuntimeMessage =
    | { action: 'checkNow' }
    | { action: 'testNotification' }
    | { action: 'testSound' }
    | { action: 'updateAlarm'; interval?: number }
    | { action: 'reconnectSignalR' }
    | { action: 'disconnectSignalR' }
    | { action: 'debugFetch' }
    | { action: 'getDefaultPrompts' }
    | {
        action: 'generateProposal';
        templateId: string;
        context: AiRequestContext;
    }
    | {
        action: 'download_zip';
        filename: string;
        files: Array<{ name: string; content?: string; url?: string }>;
    };

let bootstrapPromise: Promise<void> | null = null;
let isBootstrapped = false;

function resolvePromptTemplate(templates: PromptTemplate[], templateId: string): PromptTemplate | null {
    return (
        templates.find((template) => template.id === templateId) ??
        templates.find((template) => template.id === 'default_proposal') ??
        null
    );
}

function toGatewayTemplates(templates: PromptTemplate[], sharedSystemPrompt: string) {
    return templates.map((template) => ({
        id: template.id,
        name: template.title,
        system: sharedSystemPrompt || undefined,
        user: template.content,
    }));
}

async function generateProposal(templateId: string, context: AiRequestContext) {
    const snapshot = await storage.getSnapshot();
    const templates = snapshot.prompts.length > 0 ? snapshot.prompts : DEFAULT_PROMPTS;
    const selectedTemplate = resolvePromptTemplate(templates, templateId);

    if (!selectedTemplate) {
        return {
            success: false,
            error: `Unknown prompt template: ${templateId}`,
        };
    }

    if (snapshot.settings.aiExecutionMode === 'direct') {
        if (!snapshot.settings.aiApiKey) {
            return {
                success: false,
                error: 'Direct AI mode requires an API key.',
            };
        }

        if (!snapshot.settings.aiModel) {
            return {
                success: false,
                error: 'Direct AI mode requires a model name.',
            };
        }

        const gateway = createAiGateway({
            initialTemplates: toGatewayTemplates(templates, snapshot.settings.aiSystemPrompt),
        });
        const result = await gateway.generate({
            provider: snapshot.settings.aiProvider,
            apiKey: snapshot.settings.aiApiKey,
            model: snapshot.settings.aiModel,
            templateId: selectedTemplate.id,
            context,
        });

        return {
            success: true,
            mode: 'direct' as const,
            proposal: result.output,
            provider: result.provider,
            model: result.model,
        };
    }

    return {
        success: true,
        mode: 'bridge' as const,
        prompt: renderLegacyPromptTemplate(selectedTemplate.content, context),
        chatUrl: snapshot.settings.aiChatUrl || 'https://chatgpt.com/',
    };
}

async function bootstrap(reason: string): Promise<void> {
    await storage.ensureDefaults();
    await offscreen.bootstrap();
    await signalr.bootstrap(reason);
}

async function ensureReady(reason: string): Promise<void> {
    if (isBootstrapped) {
        return;
    }

    if (!bootstrapPromise) {
        bootstrapPromise = bootstrap(reason)
            .then(() => {
                isBootstrapped = true;
            })
            .finally(() => {
                bootstrapPromise = null;
            });
    }

    await bootstrapPromise;
}

function runTask(label: string, task: () => Promise<void>): void {
    void task().catch((error) => {
        console.error(`[background] ${label} failed`, error);
    });
}

async function handleRuntimeMessage(message: RuntimeMessage) {
    switch (message.action) {
        case 'checkNow':
            return runPolling('manual-check');
        case 'testNotification':
            await notifications.showTestNotification();
            return { success: true };
        case 'testSound':
            await audio.playNotification();
            return { success: true };
        case 'updateAlarm':
            await storage.updateSettings({ interval: message.interval });
            await signalr.bootstrap('settings-updated');
            return { success: true };
        case 'reconnectSignalR':
            await signalr.reconnect();
            return { success: true };
        case 'disconnectSignalR':
            await signalr.disconnect();
            return { success: true };
        case 'debugFetch':
            return debugFetchMostaql();
        case 'getDefaultPrompts':
            return {
                success: true,
                prompts: DEFAULT_PROMPTS,
            };
        case 'generateProposal':
            return generateProposal(message.templateId, message.context);
        case 'download_zip':
            return downloadZipArchive(message.filename, message.files);
        default:
            return undefined;
    }
}

export default defineBackground({
    type: 'module',
    main() {
        notifications.registerHandlers();

        browser.runtime.onInstalled.addListener(() => {
            runTask('runtime-installed-bootstrap', () => ensureReady('runtime-installed'));
        });

        browser.runtime.onStartup.addListener(() => {
            runTask('runtime-startup-bootstrap', () => ensureReady('runtime-startup'));
        });

        browser.alarms.onAlarm.addListener((alarm) => {
            runTask(`alarm:${alarm.name}`, async () => {
                await ensureReady(`alarm:${alarm.name}`);
                await signalr.handleAlarm(alarm);
            });
        });

        browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            // Offscreen RPC is answered by the offscreen context itself; the worker must
            // ignore the envelope synchronously so it does not intercept its own request.
            if (isOffscreenProtocolMessage(message)) {
                return undefined;
            }

            void (async () => {
                try {
                    await ensureReady(
                        `message:${String((message as { action?: string }).action ?? 'unknown')}`
                    );
                    sendResponse(await handleRuntimeMessage(message as RuntimeMessage));
                } catch (error) {
                    console.error('[background] runtime message failed', error);
                    sendResponse(undefined);
                }
            })();

            return true;
        });

        runTask('worker-start-bootstrap', () => ensureReady('worker-start'));
    },
});
