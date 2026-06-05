import { describe, expect, it, vi } from 'vitest';

import { createBackgroundRuntimeHandlers } from '../../../../src/app/background/background-runtime-handlers';
import type { JobBatchResult } from '../../../../src/features/monitoring/job-batch-publisher';
import { fakeBrowser } from '../../../support/fake-browser';

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
        vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);
        vi.spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(false);
        const create = vi.spyOn(fakeBrowser.tabs, 'create');
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
        vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
        vi.spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([
            {
                id: 17,
                url: 'https://chatgpt.com/',
            } as Browser.tabs.Tab,
        ]);
        const update = vi.spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({
            id: 17,
            url: 'https://chatgpt.com/',
        } as Browser.tabs.Tab);
        const create = vi.spyOn(fakeBrowser.tabs, 'create');
        const executeScript = vi
            .spyOn(fakeBrowser.scripting, 'executeScript')
            .mockResolvedValue([]);
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
        vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);
        vi.spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
        vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
        vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
            id: 23,
            url: 'https://chat.openai.com/',
        } as Browser.tabs.Tab);
        vi.spyOn(fakeBrowser.scripting, 'executeScript').mockRejectedValue(
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
        vi.spyOn(fakeBrowser.downloads, 'download').mockResolvedValue(42);
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
        vi.spyOn(fakeBrowser.downloads, 'download').mockRejectedValue(new Error('download failed'));
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
        const download = vi.spyOn(fakeBrowser.downloads, 'download');
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
        vi.spyOn(fakeBrowser.downloads, 'download').mockResolvedValue(77);
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
});
