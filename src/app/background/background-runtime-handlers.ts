import { browser } from 'wxt/browser';

import { debugFetchMonitoringSources } from '../../features/monitoring/fetch-platform-html';
import type { JobBatchResult } from '../../features/monitoring/job-batch-publisher';
import type { ProposalGenerator } from '../../features/proposals/generate-proposal';
import { getAiChatTargetHost, normalizeAiChatUrl } from '../../entities/ai/chat-url';
import type {
    BackgroundMessageHandlerMap,
    BackgroundMessageRequestMap,
    BackgroundMessageResponseMap,
} from './background-messages';
import type { AudioService } from '../../features/notifications/audio-service';
import type { DownloadCleanupService } from '../../features/downloads/download-cleanup-service';
import type { NotificationService } from '../../features/notifications/service';
import type { SignalRManager } from '../../features/realtime/signalr-manager';
import type { OffscreenManager } from '../../features/offscreen/manager';
import type { ExtensionStorage } from '../../shared/storage/extension-storage';
import type { PlatformMonitoringAdapter } from '../../platforms/contracts';
import type { ProposalRepository } from '../../features/proposals/proposal-repository';

const CHATGPT_BRIDGE_SCRIPT_FILE = '/chatgpt-bridge.js';

interface BackgroundRuntimeHandlerDependencies {
    readonly storage: ExtensionStorage;
    readonly notifications: NotificationService;
    readonly downloads: DownloadCleanupService;
    readonly audio: AudioService;
    readonly offscreen: OffscreenManager;
    readonly signalr: SignalRManager;
    readonly monitoring: readonly PlatformMonitoringAdapter[];
    readonly proposals: ProposalGenerator;
    readonly proposalRepository: Pick<ProposalRepository, 'setPendingBridgePrompt'>;
    readonly runPolling: (reason: string) => Promise<JobBatchResult>;
}

function getChatBridgeHostPermission(chatUrl: string): string {
    return `https://${getAiChatTargetHost(chatUrl)}/*`;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function ensureChatBridgePermission(chatUrl: string): Promise<boolean | 'unsupported'> {
    if (!browser.permissions?.request) {
        return 'unsupported';
    }

    const origins = [getChatBridgeHostPermission(chatUrl)];

    if (browser.permissions.contains && (await browser.permissions.contains({ origins }))) {
        return true;
    }

    return browser.permissions.request({ origins });
}

async function resolveChatBridgeTab(chatUrl: string): Promise<{
    readonly tabId: number;
    readonly tabStatus: 'created' | 'focused';
}> {
    if (!browser.tabs?.create || !browser.tabs.query || !browser.tabs.update) {
        throw new Error('Tabs API is unavailable.');
    }

    const hostPermission = getChatBridgeHostPermission(chatUrl);
    const existingTabs = await browser.tabs.query({ url: hostPermission });
    const existingTab = existingTabs.find((tab) => typeof tab.id === 'number');

    if (typeof existingTab?.id === 'number') {
        await browser.tabs.update(existingTab.id, {
            active: true,
        });

        return {
            tabId: existingTab.id,
            tabStatus: 'focused',
        };
    }

    const createdTab = await browser.tabs.create({
        url: chatUrl,
        active: true,
    });

    if (typeof createdTab.id !== 'number') {
        throw new Error('Created ChatGPT tab did not include an id.');
    }

    return {
        tabId: createdTab.id,
        tabStatus: 'created',
    };
}

async function injectChatBridge(tabId: number): Promise<void> {
    if (!browser.scripting?.executeScript) {
        throw new Error('Scripting API is unavailable.');
    }

    await browser.scripting.executeScript({
        target: {
            tabId,
        },
        files: [CHATGPT_BRIDGE_SCRIPT_FILE],
    });
}

async function openChatBridgePrompt(
    deps: BackgroundRuntimeHandlerDependencies,
    message: BackgroundMessageRequestMap['openChatBridgePrompt']
): Promise<BackgroundMessageResponseMap['openChatBridgePrompt']> {
    if (!browser.tabs || !browser.permissions || !browser.scripting) {
        return {
            success: false,
            reason: 'unsupported',
        };
    }

    const chatUrl = normalizeAiChatUrl(message.chatUrl);
    let permission: Awaited<ReturnType<typeof ensureChatBridgePermission>>;

    try {
        permission = await ensureChatBridgePermission(chatUrl);
    } catch (error) {
        return {
            success: false,
            reason: 'permission-denied',
            error: getErrorMessage(error),
        };
    }

    if (permission === 'unsupported') {
        return {
            success: false,
            reason: 'unsupported',
        };
    }

    if (!permission) {
        return {
            success: false,
            reason: 'permission-denied',
        };
    }

    let tab: Awaited<ReturnType<typeof resolveChatBridgeTab>>;

    try {
        tab = await resolveChatBridgeTab(chatUrl);
    } catch (error) {
        return {
            success: false,
            reason: 'tab-open-failed',
            error: getErrorMessage(error),
        };
    }

    try {
        await deps.proposalRepository.setPendingBridgePrompt(message.prompt, chatUrl);
        await injectChatBridge(tab.tabId);
    } catch (error) {
        return {
            success: false,
            reason: 'injection-failed',
            error: getErrorMessage(error),
        };
    }

    return {
        success: true,
        tabId: tab.tabId,
        tabStatus: tab.tabStatus,
        injected: true,
    };
}

async function downloadZip(
    deps: BackgroundRuntimeHandlerDependencies,
    message: BackgroundMessageRequestMap['downloadZip']
): Promise<BackgroundMessageResponseMap['downloadZip']> {
    const zipUrl = await deps.offscreen.request('downloads.create-zip-url', {
        filename: message.filename,
        files: message.files,
    });

    if (!zipUrl.success || !zipUrl.objectUrl || !zipUrl.filename) {
        return {
            success: false,
            error: zipUrl.error ?? 'Failed to create ZIP download URL.',
        };
    }

    let downloadId: number;

    try {
        downloadId = await browser.downloads.download({
            url: zipUrl.objectUrl,
            filename: zipUrl.filename,
            saveAs: true,
        });
    } catch (error) {
        try {
            await deps.offscreen.request('downloads.revoke-object-url', {
                objectUrl: zipUrl.objectUrl,
            });
        } catch (cleanupError) {
            console.warn('[background] failed to revoke offscreen object URL', cleanupError);
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    try {
        await deps.downloads.trackObjectUrlDownload({
            downloadId,
            objectUrl: zipUrl.objectUrl,
            filename: zipUrl.filename,
        });
    } catch (error) {
        console.warn('[background] failed to persist download cleanup record', error);
    }

    return {
        success: true,
        downloadId,
    };
}

export function createBackgroundRuntimeHandlers(
    deps: BackgroundRuntimeHandlerDependencies
): BackgroundMessageHandlerMap {
    return {
        checkNow: () => deps.runPolling('manual-check'),
        async testNotification() {
            await deps.notifications.showTestNotification();
            return { success: true } as const;
        },
        async testSound() {
            await deps.audio.playNotification();
            return { success: true } as const;
        },
        async updateAlarm(message) {
            await deps.storage.updateSettings({ interval: message.interval });
            await deps.signalr.bootstrap('settings-updated');
            return { success: true } as const;
        },
        async reconnectSignalR() {
            await deps.signalr.reconnect();
            return { success: true } as const;
        },
        async disconnectSignalR() {
            await deps.signalr.disconnect();
            return { success: true } as const;
        },
        debugFetch: async () => {
            const settings = await deps.storage.getSettings();
            const enabledMonitoring = deps.monitoring.filter(
                (adapter) => adapter.resolveFeeds(settings).length > 0
            );

            return debugFetchMonitoringSources(enabledMonitoring);
        },
        generateProposal: (message) => deps.proposals.generate(message.templateId, message.context),
        openChatBridgePrompt: (message) => openChatBridgePrompt(deps, message),
        downloadZip: (message) => downloadZip(deps, message),
    };
}
