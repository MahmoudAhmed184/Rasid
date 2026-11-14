import { describe, expect, it, vi } from 'vitest';

import { createBackgroundRuntimeHandlers } from '../../../../src/app/background/background-runtime-handlers';
import type { JobBatchResult } from '../../../../src/features/monitoring/job-batch-publisher';
import { fakeBrowser } from '../../../support/fake-browser';

const spyOn = (obj: object, method: string): ReturnType<typeof vi.fn> =>
    vi.spyOn(obj, method as never) as unknown as ReturnType<typeof vi.fn>;

function createDeps(overrides: Record<string, unknown> = {}) {
    const storage = {
        updateSettings: vi.fn(async () => ({ interval: 5 })),
        getSettings: vi.fn(async () => ({
            monitoredPlatforms: { mostaql: true, khamsat: true, nafezly: true },
        })),
    };
    const offscreen = {
        request: vi.fn(async () => ({
            success: true,
            filename: 'export.zip',
            objectUrl: 'blob:zip',
        })),
    };
    const downloads = {
        trackObjectUrlDownload: vi.fn(async () => undefined),
    };
    const deps = {
        storage,
        notifications: {
            showTestNotification: vi.fn(async () => 'n1'),
        },
        downloads,
        audio: {
            playNotification: vi.fn(async () => undefined),
        },
        offscreen,
        signalr: {
            bootstrap: vi.fn(async () => undefined),
            reconnect: vi.fn(async () => undefined),
            disconnect: vi.fn(async () => undefined),
        },
        monitoring: [],
        proposals: {
            generate: vi.fn(async () => ({ success: false, error: 'not used' })),
        },
        proposalRepository: {
            setPendingBridgePrompt: vi.fn(async () => undefined),
            getPendingBridgePrompt: vi.fn(async () => null),
        },
        runPolling: vi.fn(async (): Promise<JobBatchResult> => {
            return {
                kind: 'noop',
                source: 'polling',
                reason: 'no-new-jobs',
                totalChecked: 0,
            };
        }),
        ...overrides,
    };

    return deps;
}

describe('background runtime handlers', () => {
    it('delegates manual checks, notifications, sound, and SignalR commands', async () => {
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(handlers.checkNow({ action: 'checkNow' })).resolves.toEqual({
            kind: 'noop',
            source: 'polling',
            reason: 'no-new-jobs',
            totalChecked: 0,
        });
        await expect(handlers.testNotification({ action: 'testNotification' })).resolves.toEqual({
            success: true,
        });
        await expect(handlers.testSound({ action: 'testSound' })).resolves.toEqual({
            success: true,
        });
        await expect(handlers.reconnectSignalR({ action: 'reconnectSignalR' })).resolves.toEqual({
            success: true,
        });
        await expect(handlers.disconnectSignalR({ action: 'disconnectSignalR' })).resolves.toEqual({
            success: true,
        });

        expect(deps.runPolling).toHaveBeenCalledWith('manual-check');
        expect(deps.notifications.showTestNotification).toHaveBeenCalledOnce();
        expect(deps.audio.playNotification).toHaveBeenCalledOnce();
        expect(deps.signalr.reconnect).toHaveBeenCalledOnce();
        expect(deps.signalr.disconnect).toHaveBeenCalledOnce();
    });

    it('dispatches test sound playback without blocking the message response', async () => {
        let resolvePlayback!: () => void;
        let playbackStarted = false;
        const playNotification = vi.fn(() => {
            playbackStarted = true;
            return new Promise<void>((resolve) => {
                resolvePlayback = resolve;
            });
        });
        const deps = createDeps({
            audio: { playNotification },
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        const responsePromise = handlers.testSound({ action: 'testSound' });
        await expect(responsePromise).resolves.toEqual({ success: true });
        expect(playbackStarted).toBe(true);
        expect(playNotification).toHaveBeenCalledOnce();

        resolvePlayback();
    });

    it('propagates rejected test notification errors', async () => {
        const deps = createDeps({
            notifications: {
                showTestNotification: vi.fn(async () => {
                    throw new Error('Property "buttons" is unsupported by Firefox');
                }),
            },
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(handlers.testNotification({ action: 'testNotification' })).rejects.toThrow(
            'Property "buttons" is unsupported by Firefox'
        );
        expect(deps.notifications.showTestNotification).toHaveBeenCalledOnce();
    });

    it('returns a deterministic debug fetch failure when all monitoring feeds are disabled', async () => {
        const deps = createDeps({
            monitoring: [
                {
                    id: 'mostaql',
                    displayName: 'Mostaql',
                    debugProbeUrl: 'https://mostaql.com/projects',
                    resolveFeeds: vi.fn(() => []),
                    parseListingHtml: vi.fn(async () => []),
                    parseProjectHtml: vi.fn(async () => null),
                },
            ],
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(handlers.debugFetch({ action: 'debugFetch' })).resolves.toEqual({
            success: false,
            error: 'No monitoring platforms are enabled.',
        });
        expect(deps.storage.getSettings).toHaveBeenCalledOnce();
    });

    it('delegates proposal generation payloads without calling providers directly', async () => {
        const deps = createDeps({
            proposals: {
                generate: vi.fn(async () => ({
                    success: true,
                    proposal: 'Generated proposal',
                    provider: 'openai',
                    model: 'gpt-test',
                })),
            },
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(
            handlers.generateProposal({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: {
                    title: 'مشروع اختبار',
                    description: 'وصف المشروع',
                },
            })
        ).resolves.toEqual({
            success: true,
            proposal: 'Generated proposal',
            provider: 'openai',
            model: 'gpt-test',
        });
        expect(deps.proposals.generate).toHaveBeenCalledWith('default_proposal', {
            title: 'مشروع اختبار',
            description: 'وصف المشروع',
        });
    });

    it('returns an actionable bridge failure when ChatGPT host permission is denied', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(false);
        const create = spyOn(fakeBrowser.tabs, 'create');
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(
            handlers.openChatBridgePrompt({
                action: 'openChatBridgePrompt',
                prompt: 'Draft proposal',
                chatUrl: 'https://chatgpt.com/',
            })
        ).resolves.toEqual({
            success: false,
            reason: 'permission-denied',
        });
        expect(fakeBrowser.permissions.request).toHaveBeenCalledWith({
            origins: ['https://chatgpt.com/*'],
        });
        expect(deps.proposalRepository.setPendingBridgePrompt).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it('focuses existing ChatGPT tabs, stores the prompt, and injects the bridge script once', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([
            {
                id: 17,
                url: 'https://chatgpt.com/',
            } as Browser.tabs.Tab,
        ]);
        const update = spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({
            id: 17,
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        const create = spyOn(fakeBrowser.tabs, 'create');
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(
            handlers.openChatBridgePrompt({
                action: 'openChatBridgePrompt',
                prompt: 'Draft proposal',
                chatUrl: 'https://chatgpt.com/',
            })
        ).resolves.toEqual({
            success: true,
            tabId: 17,
            tabStatus: 'focused',
            injected: true,
        });
        expect(fakeBrowser.permissions.request).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith(17, { active: true });
        expect(create).not.toHaveBeenCalled();
        expect(deps.proposalRepository.setPendingBridgePrompt).toHaveBeenCalledWith(
            'Draft proposal',
            'https://chatgpt.com/'
        );
        expect(executeScript).toHaveBeenCalledTimes(1);
        expect(executeScript).toHaveBeenCalledWith({
            target: {
                tabId: 17,
            },
            files: ['/chatgpt-bridge.js'],
        });
    });

    it('reports injection failures after opening ChatGPT and storing the prompt', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 23,
            status: 'complete',
            url: 'https://chat.openai.com/',
        } as Browser.tabs.Tab);
        spyOn(fakeBrowser.scripting, 'executeScript').mockRejectedValue(
            new Error('Cannot access tab')
        );
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(
            handlers.openChatBridgePrompt({
                action: 'openChatBridgePrompt',
                prompt: 'Draft proposal',
                chatUrl: 'https://chat.openai.com/',
            })
        ).resolves.toEqual({
            success: false,
            reason: 'injection-failed',
            error: 'Cannot access tab',
        });
        expect(deps.proposalRepository.setPendingBridgePrompt).toHaveBeenCalledWith(
            'Draft proposal',
            'https://chat.openai.com/'
        );
    });

    it('waits for tab completion via onUpdated before injecting bridge script into newly created tabs', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 88,
            status: 'loading',
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        const openPromise = handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Draft proposal',
            chatUrl: 'https://chatgpt.com/',
        });

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(executeScript).not.toHaveBeenCalled();

        await fakeBrowser.tabs.onUpdated.trigger(88, { status: 'complete' }, {
            id: 88,
            status: 'complete',
        } as Browser.tabs.Tab);

        const result = await openPromise;
        expect(result).toEqual({
            success: true,
            tabId: 88,
            tabStatus: 'created',
            injected: true,
        });
        expect(executeScript).toHaveBeenCalledWith({
            target: { tabId: 88 },
            files: ['/chatgpt-bridge.js'],
        });
        expect(deps.proposalRepository.setPendingBridgePrompt).toHaveBeenCalledWith(
            'Draft proposal',
            'https://chatgpt.com/'
        );
    });

    it('waits for tab completion via active status polling before injecting bridge script', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 99,
            status: 'loading',
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        let pollCount = 0;
        spyOn(fakeBrowser.tabs, 'get').mockImplementation(async (tabId: number) => {
            pollCount++;
            return {
                id: tabId,
                status: pollCount >= 2 ? 'complete' : 'loading',
                url: 'https://chatgpt.com/',
            } as Browser.tabs.Tab;
        });
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        const result = await handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Draft proposal',
            chatUrl: 'https://chatgpt.com/',
        });

        expect(result).toEqual({
            success: true,
            tabId: 99,
            tabStatus: 'created',
            injected: true,
        });
        expect(executeScript).toHaveBeenCalledWith({
            target: { tabId: 99 },
            files: ['/chatgpt-bridge.js'],
        });
    });

    it('waits for existing loading tab to reach complete before injecting bridge script', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([
            {
                id: 55,
                status: 'loading',
                url: 'https://chatgpt.com/',
            } as Browser.tabs.Tab,
        ]);
        spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({
            id: 55,
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        const openPromise = handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Draft proposal',
            chatUrl: 'https://chatgpt.com/',
        });

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(executeScript).not.toHaveBeenCalled();

        await fakeBrowser.tabs.onUpdated.trigger(55, { status: 'complete' }, {
            id: 55,
            status: 'complete',
        } as Browser.tabs.Tab);

        const result = await openPromise;
        expect(result).toEqual({
            success: true,
            tabId: 55,
            tabStatus: 'focused',
            injected: true,
        });
        expect(executeScript).toHaveBeenCalledWith({
            target: { tabId: 55 },
            files: ['/chatgpt-bridge.js'],
        });
    });

    it('updates settings and reboots SignalR when alarm settings change', async () => {
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(
            handlers.updateAlarm({ action: 'updateAlarm', interval: 12 })
        ).resolves.toEqual({
            success: true,
        });
        expect(deps.storage.updateSettings).toHaveBeenCalledWith({ interval: 12 });
        expect(deps.signalr.bootstrap).toHaveBeenCalledWith('settings-updated');
    });

    it('creates ZIP downloads and records object URL cleanup state', async () => {
        spyOn(fakeBrowser.downloads, 'download').mockResolvedValue(42);
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(
            handlers.downloadZip({
                action: 'downloadZip',
                filename: 'export.zip',
                files: [{ name: 'readme.txt', content: 'hello' }],
            })
        ).resolves.toEqual({
            success: true,
            downloadId: 42,
        });
        expect(deps.offscreen.request).toHaveBeenCalledWith('downloads.create-zip-url', {
            filename: 'export.zip',
            files: [{ name: 'readme.txt', content: 'hello' }],
        });
        expect(deps.downloads.trackObjectUrlDownload).toHaveBeenCalledWith({
            downloadId: 42,
            objectUrl: 'blob:zip',
            filename: 'export.zip',
        });
    });

    it('revokes offscreen object URLs when browser download creation fails', async () => {
        spyOn(fakeBrowser.downloads, 'download').mockRejectedValue(new Error('download failed'));
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(
            handlers.downloadZip({
                action: 'downloadZip',
                filename: 'export.zip',
                files: [{ name: 'readme.txt', content: 'hello' }],
            })
        ).resolves.toEqual({
            success: false,
            error: 'download failed',
        });
        expect(deps.offscreen.request).toHaveBeenCalledWith('downloads.revoke-object-url', {
            objectUrl: 'blob:zip',
        });
    });

    it('returns ZIP creation failures before calling browser downloads', async () => {
        const download = spyOn(fakeBrowser.downloads, 'download');
        const deps = createDeps({
            offscreen: {
                request: vi.fn(async () => ({
                    success: false,
                    error: 'zip failed',
                })),
            },
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(
            handlers.downloadZip({
                action: 'downloadZip',
                filename: 'export.zip',
                files: [{ name: 'readme.txt', content: 'hello' }],
            })
        ).resolves.toEqual({
            success: false,
            error: 'zip failed',
        });
        expect(download).not.toHaveBeenCalled();
    });

    it('returns successful ZIP downloads even when cleanup tracking cannot be persisted', async () => {
        spyOn(fakeBrowser.downloads, 'download').mockResolvedValue(77);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const deps = createDeps({
            downloads: {
                trackObjectUrlDownload: vi.fn(async () => {
                    throw new Error('storage failed');
                }),
            },
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await expect(
            handlers.downloadZip({
                action: 'downloadZip',
                filename: 'export.zip',
                files: [{ name: 'readme.txt', content: 'hello' }],
            })
        ).resolves.toEqual({
            success: true,
            downloadId: 77,
        });
        expect(warn).toHaveBeenCalledWith(
            '[background] failed to persist download cleanup record',
            expect.any(Error)
        );
    });

    it('waits for navigation when newly created tab starts with about:blank status complete before injecting', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 77,
            status: 'complete',
            url: 'about:blank',
        } as Browser.tabs.Tab);
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        const openPromise = handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Prompt on fresh tab',
            chatUrl: 'https://chatgpt.com/',
        });

        await new Promise((resolve) => setTimeout(resolve, 10));
        // Script must NOT be injected into about:blank
        expect(executeScript).not.toHaveBeenCalled();

        // Simulate navigation completing to chatgpt.com
        await fakeBrowser.tabs.onUpdated.trigger(77, { status: 'complete' }, {
            id: 77,
            status: 'complete',
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);

        const result = await openPromise;
        expect(result).toEqual({
            success: true,
            tabId: 77,
            tabStatus: 'created',
            injected: true,
        });
        expect(executeScript).toHaveBeenCalledWith({
            target: { tabId: 77 },
            files: ['/chatgpt-bridge.js'],
        });
    });

    it('re-injects bridge script on redirected tab when prompt is still pending in storage', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 78,
            status: 'complete',
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const pendingRecord = {
            id: 'bridge-redirect-1',
            prompt: 'Pending prompt after redirect',
            createdAt: 1,
            expiresAt: 300_000,
            targetHost: 'chatgpt.com',
        };
        const deps = createDeps({
            proposalRepository: {
                setPendingBridgePrompt: vi.fn(async () => undefined),
                getPendingBridgePrompt: vi.fn(async () => pendingRecord),
            },
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Pending prompt after redirect',
            chatUrl: 'https://chatgpt.com/',
        });

        expect(executeScript).toHaveBeenCalledTimes(1);

        // Simulate subsequent redirect navigation finishing
        await fakeBrowser.tabs.onUpdated.trigger(78, { status: 'complete' }, {
            id: 78,
            status: 'complete',
            url: 'https://chatgpt.com/?model=auto',
        } as Browser.tabs.Tab);

        expect(executeScript).toHaveBeenCalledTimes(2);
    });

    it('re-injects bridge script on tab URL change event when prompt is pending', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 79,
            status: 'complete',
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const pendingRecord = {
            id: 'bridge-redirect-url-change',
            prompt: 'Pending prompt after url change',
            createdAt: 1,
            expiresAt: 300_000,
            targetHost: 'chatgpt.com',
        };
        const deps = createDeps({
            proposalRepository: {
                setPendingBridgePrompt: vi.fn(async () => undefined),
                getPendingBridgePrompt: vi.fn(async () => pendingRecord),
            },
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Pending prompt after url change',
            chatUrl: 'https://chatgpt.com/',
        });

        expect(executeScript).toHaveBeenCalledTimes(1);

        // Simulate client SPA route transition with url change where status is already complete
        await fakeBrowser.tabs.onUpdated.trigger(79, { url: 'https://chatgpt.com/c/new-chat' }, {
            id: 79,
            status: 'complete',
            url: 'https://chatgpt.com/c/new-chat',
        } as Browser.tabs.Tab);

        expect(executeScript).toHaveBeenCalledTimes(2);
    });

    it('cleans up navigation listener when tab is closed before injection completes', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 80,
            status: 'complete',
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const removeListenerSpy = spyOn(fakeBrowser.tabs.onUpdated, 'removeListener');
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Prompt on tab to close',
            chatUrl: 'https://chatgpt.com/',
        });

        // Trigger tab removal
        await fakeBrowser.tabs.onRemoved.trigger(80, { windowId: 1, isWindowClosing: false });

        expect(removeListenerSpy).toHaveBeenCalled();
    });

    it('does not re-inject when pending prompt has already been cleared from storage', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 81,
            status: 'complete',
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const removeListenerSpy = spyOn(fakeBrowser.tabs.onUpdated, 'removeListener');
        let currentPendingPrompt: unknown = {
            id: 'bridge-cleared',
            prompt: 'Prompt to clear',
            createdAt: 1,
            expiresAt: 300_000,
            targetHost: 'chatgpt.com',
        };
        const deps = createDeps({
            proposalRepository: {
                setPendingBridgePrompt: vi.fn(async () => undefined),
                getPendingBridgePrompt: vi.fn(async () => currentPendingPrompt),
            },
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Prompt to clear',
            chatUrl: 'https://chatgpt.com/',
        });

        expect(executeScript).toHaveBeenCalledTimes(1);

        // Prompt is successfully cleared by the first injection
        currentPendingPrompt = null;

        // Simulate subsequent navigation
        await fakeBrowser.tabs.onUpdated.trigger(81, { status: 'complete' }, {
            id: 81,
            status: 'complete',
            url: 'https://chatgpt.com/?model=auto',
        } as Browser.tabs.Tab);

        // Should not have injected a second time
        expect(executeScript).toHaveBeenCalledTimes(1);
        expect(removeListenerSpy).toHaveBeenCalled();
    });

    it('focuses existing ChatGPT tab when open on alternate allowed host (chat.openai.com)', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        // Query for https://chatgpt.com/* returns empty, but https://chat.openai.com/* returns existing tab
        spyOn(fakeBrowser.tabs, 'query').mockImplementation(async (queryInfo: { url?: string }) => {
            if (queryInfo.url === 'https://chat.openai.com/*') {
                return [
                    {
                        id: 44,
                        windowId: 1,
                        status: 'complete',
                        url: 'https://chat.openai.com/',
                    } as Browser.tabs.Tab,
                ];
            }
            return [];
        });
        const updateTabSpy = spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({
            id: 44,
        } as Browser.tabs.Tab);
        const updateWindowSpy = spyOn(fakeBrowser.windows, 'update').mockResolvedValue({} as never);
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const deps = createDeps();
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        const result = await handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Prompt for alternate host tab',
            chatUrl: 'https://chatgpt.com/',
        });

        expect(result).toEqual({
            success: true,
            tabId: 44,
            tabStatus: 'focused',
            injected: true,
        });
        expect(deps.proposalRepository.setPendingBridgePrompt).toHaveBeenCalledWith(
            'Prompt for alternate host tab',
            'https://chat.openai.com/'
        );
        expect(updateTabSpy).toHaveBeenCalledWith(44, { active: true });
        expect(updateWindowSpy).toHaveBeenCalledWith(1, { focused: true });
        expect(executeScript).toHaveBeenCalledWith({
            target: { tabId: 44 },
            files: ['/chatgpt-bridge.js'],
        });
    });

    it('does not re-inject bridge script when onUpdated status is loading', async () => {
        spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 95,
            status: 'complete',
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        const executeScript = spyOn(fakeBrowser.scripting, 'executeScript').mockResolvedValue([]);
        const pendingRecord = {
            id: 'bridge-loading-status',
            prompt: 'Pending prompt',
            createdAt: 1,
            expiresAt: 300_000,
            targetHost: 'chatgpt.com',
        };
        const deps = createDeps({
            proposalRepository: {
                setPendingBridgePrompt: vi.fn(async () => undefined),
                getPendingBridgePrompt: vi.fn(async () => pendingRecord),
            },
        });
        const handlers = createBackgroundRuntimeHandlers(deps as never);

        await handlers.openChatBridgePrompt({
            action: 'openChatBridgePrompt',
            prompt: 'Pending prompt',
            chatUrl: 'https://chatgpt.com/',
        });

        expect(executeScript).toHaveBeenCalledTimes(1);

        // onUpdated with loading status must not trigger injection
        await fakeBrowser.tabs.onUpdated.trigger(95, { status: 'loading' }, {
            id: 95,
            status: 'loading',
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);

        expect(executeScript).toHaveBeenCalledTimes(1);
    });
});
