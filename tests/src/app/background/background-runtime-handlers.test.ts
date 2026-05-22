import { describe, expect, it, vi } from 'vitest';

import { createBackgroundRuntimeHandlers } from '../../../../src/app/background/background-runtime-handlers';
import type { JobBatchResult } from '../../../../src/features/monitoring/job-batch-publisher';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';
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
