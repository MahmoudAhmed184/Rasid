import { browser } from 'wxt/browser';

import { debugFetchMonitoringSources } from '../../features/monitoring/fetch-platform-html';
import type { JobBatchResult } from '../../features/monitoring/job-batch-publisher';
import type { ProposalGenerator } from '../../features/proposals/generate-proposal';
import {
    getChatBridgeHostPermission,
    hasChatBridgePermission,
    requestChatBridgePermission,
} from '../../shared/browser/permissions';
import { isAllowedAiChatHost, normalizeAiChatUrl } from '../../entities/ai/chat-url';
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
const TAB_COMPLETE_WAIT_TIMEOUT_MS = 10_000;
const TAB_NAVIGATION_MONITOR_TIMEOUT_MS = 30_000;

interface BackgroundRuntimeHandlerDependencies {
    readonly storage: ExtensionStorage;
    readonly notifications: NotificationService;
    readonly downloads: DownloadCleanupService;
    readonly audio: AudioService;
    readonly offscreen: OffscreenManager;
    readonly signalr: SignalRManager;
    readonly monitoring: readonly PlatformMonitoringAdapter[];
    readonly proposals: ProposalGenerator;
    readonly proposalRepository: Pick<
        ProposalRepository,
        'setPendingBridgePrompt' | 'getPendingBridgePrompt'
    >;
    readonly runPolling: (reason: string) => Promise<JobBatchResult>;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function ensureChatBridgePermission(chatUrl: string): Promise<boolean | 'unsupported'> {
    if (!browser.permissions?.request && !browser.permissions?.contains) {
        return 'unsupported';
    }

    if (await hasChatBridgePermission(chatUrl)) {
        return true;
    }

    if (!browser.permissions?.request) {
        return 'unsupported';
    }

    return requestChatBridgePermission(chatUrl);
}

function isTabReady(tab?: { status?: string; url?: string }): boolean {
    if (!tab || tab.status !== 'complete') {
        return false;
    }

    if (tab.url) {
        if (
            tab.url === 'about:blank' ||
            tab.url.startsWith('chrome://') ||
            tab.url.startsWith('edge://')
        ) {
            return false;
        }

        try {
            const url = new URL(tab.url);
            return isAllowedAiChatHost(url.hostname);
        } catch {
            return false;
        }
    }

    return true;
}

async function waitForTabComplete(
    tabId: number,
    timeoutMs = TAB_COMPLETE_WAIT_TIMEOUT_MS
): Promise<void> {
    if (!browser.tabs?.onUpdated && !browser.tabs?.get) {
        return;
    }

    if (browser.tabs.get) {
        try {
            const currentTab = await browser.tabs.get(tabId);
            if (isTabReady(currentTab)) {
                return;
            }
        } catch {
            // Ignore tab retrieval errors
        }
    }

    return new Promise((resolve) => {
        let settled = false;
        let pollTimer: ReturnType<typeof setInterval> | undefined;

        const cleanup = () => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            if (pollTimer) {
                clearInterval(pollTimer);
            }
            if (browser.tabs?.onUpdated?.removeListener) {
                try {
                    browser.tabs.onUpdated.removeListener(onUpdatedListener);
                } catch {
                    // Ignore listener removal errors
                }
            }
            if (browser.tabs?.onRemoved?.removeListener) {
                try {
                    browser.tabs.onRemoved.removeListener(onRemovedListener);
                } catch {
                    // Ignore listener removal errors
                }
            }
            resolve();
        };

        const timer = setTimeout(() => {
            cleanup();
        }, timeoutMs);

        const onUpdatedListener = (
            updatedTabId: number,
            changeInfo: { status?: string },
            tab?: { status?: string; url?: string }
        ) => {
            if (updatedTabId !== tabId) {
                return;
            }

            if (isTabReady(tab)) {
                cleanup();
                return;
            }

            if (changeInfo.status === 'complete') {
                if (tab && isTabReady(tab)) {
                    cleanup();
                    return;
                }

                if (browser.tabs?.get) {
                    void browser.tabs
                        .get(tabId)
                        .then((fetchedTab) => {
                            if (isTabReady(fetchedTab)) {
                                cleanup();
                            }
                        })
                        .catch(() => undefined);
                }
            }
        };

        const onRemovedListener = (removedTabId: number) => {
            if (removedTabId === tabId) {
                cleanup();
            }
        };

        if (browser.tabs?.onUpdated?.addListener) {
            browser.tabs.onUpdated.addListener(onUpdatedListener);
        }

        if (browser.tabs?.onRemoved?.addListener) {
            browser.tabs.onRemoved.addListener(onRemovedListener);
        }

        if (browser.tabs?.get) {
            pollTimer = setInterval(() => {
                if (settled) {
                    return;
                }
                void browser.tabs
                    ?.get?.(tabId)
                    .then((tab) => {
                        if (isTabReady(tab)) {
                            cleanup();
                        }
                    })
                    .catch(() => {
                        // Ignore polling errors
                    });
            }, 100);
        }
    });
}

function monitorBridgeTabNavigation(
    deps: BackgroundRuntimeHandlerDependencies,
    tabId: number,
    timeoutMs = TAB_NAVIGATION_MONITOR_TIMEOUT_MS
): void {
    if (!browser.tabs?.onUpdated?.addListener) {
        return;
    }

    let settled = false;

    const cleanup = () => {
        if (settled) {
            return;
        }
        settled = true;
        clearTimeout(timer);
        if (browser.tabs?.onUpdated?.removeListener) {
            try {
                browser.tabs.onUpdated.removeListener(onUpdatedListener);
            } catch {
                // Ignore listener removal errors
            }
        }
        if (browser.tabs?.onRemoved?.removeListener) {
            try {
                browser.tabs.onRemoved.removeListener(onRemovedListener);
            } catch {
                // Ignore listener removal errors
            }
        }
    };

    const timer = setTimeout(cleanup, timeoutMs);

    const onRemovedListener = (removedTabId: number) => {
        if (removedTabId === tabId) {
            cleanup();
        }
    };

    const onUpdatedListener = (
        updatedTabId: number,
        changeInfo: { status?: string; url?: string },
        tab?: { status?: string; url?: string }
    ) => {
        if (updatedTabId !== tabId) {
            return;
        }

        const hasStatusComplete = changeInfo.status === 'complete';
        const hasUrlChange = Boolean(changeInfo.url);

        if (!hasStatusComplete && !hasUrlChange) {
            return;
        }

        if (changeInfo.status === 'loading') {
            return;
        }

        const checkAndInject = async () => {
            let currentTab = tab;
            if ((!currentTab?.url || !currentTab?.status) && browser.tabs?.get) {
                try {
                    currentTab = await browser.tabs.get(tabId);
                } catch {
                    // Ignore tab fetch error
                }
            }

            if (!currentTab || !isTabReady(currentTab)) {
                return;
            }

            try {
                const pending = await deps.proposalRepository.getPendingBridgePrompt();
                if (!pending) {
                    cleanup();
                    return;
                }

                await injectChatBridge(tabId);
            } catch {
                // Script injection may fail if tab was closed or host permissions revoked
            }
        };

        void checkAndInject();
    };

    browser.tabs.onUpdated.addListener(onUpdatedListener);
    if (browser.tabs?.onRemoved?.addListener) {
        browser.tabs.onRemoved.addListener(onRemovedListener);
    }
}

async function resolveChatBridgeTab(chatUrl: string): Promise<{
    readonly tabId: number;
    readonly tabStatus: 'created' | 'focused';
    readonly chatUrl?: string;
}> {
    if (!browser.tabs?.create || !browser.tabs.query || !browser.tabs.update) {
        throw new Error('Tabs API is unavailable.');
    }

    const hostPermission = getChatBridgeHostPermission(chatUrl);
    const existingTabs = await browser.tabs.query({ url: hostPermission });
    let existingTab = existingTabs.find((tab) => typeof tab.id === 'number');

    if (!existingTab) {
        const alternateHost = chatUrl.includes('chatgpt.com') ? 'chat.openai.com' : 'chatgpt.com';
        try {
            const alternateTabs = await browser.tabs.query({ url: `https://${alternateHost}/*` });
            existingTab = alternateTabs.find((tab) => typeof tab.id === 'number');
        } catch {
            // Ignore alternate host query error
        }
    }

    if (typeof existingTab?.id === 'number') {
        await browser.tabs.update(existingTab.id, {
            active: true,
        });

        if (typeof existingTab.windowId === 'number' && browser.windows?.update) {
            try {
                await browser.windows.update(existingTab.windowId, { focused: true });
            } catch {
                // Ignore window focus errors
            }
        }

        if (existingTab.status === 'loading') {
            await waitForTabComplete(existingTab.id);
        }

        return {
            tabId: existingTab.id,
            tabStatus: 'focused',
            chatUrl: existingTab.url,
        };
    }

    const createdTab = await browser.tabs.create({
        url: chatUrl,
        active: true,
    });

    if (typeof createdTab.id !== 'number') {
        throw new Error('Created ChatGPT tab did not include an id.');
    }

    if (typeof createdTab.windowId === 'number' && browser.windows?.update) {
        try {
            await browser.windows.update(createdTab.windowId, { focused: true });
        } catch {
            // Ignore window focus errors
        }
    }

    if (!isTabReady(createdTab)) {
        await waitForTabComplete(createdTab.id);
    }

    return {
        tabId: createdTab.id,
        tabStatus: 'created',
        chatUrl: createdTab.url,
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
        const targetChatUrl = tab.chatUrl || chatUrl;
        await deps.proposalRepository.setPendingBridgePrompt(message.prompt, targetChatUrl);
        monitorBridgeTabNavigation(deps, tab.tabId);
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
            void deps.audio.playNotification().catch((error) => {
                console.warn('[background] test sound error:', error);
            });
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
