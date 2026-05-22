import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeBrowser, resetFakeBrowser } from '../../support/fake-browser';

const entrypointMocks = vi.hoisted(() => {
    const app = {
        notifications: {
            registerHandlers: vi.fn(),
        },
        downloads: {
            registerHandlers: vi.fn(),
        },
        signalr: {
            handleAlarm: vi.fn(async () => true),
        },
        runtimeMessageHandlers: {
            testNotification: vi.fn(async () => ({ success: true })),
        },
        ensureReady: vi.fn(async (_reason: string) => undefined),
    };
    const createBackgroundApp = vi.fn(() => app);
    const registerBackgroundRuntimeMessageBus = vi.fn();
    const restrictBrowserSessionStorageToTrustedContexts = vi.fn(async () => undefined);
    const defineBackground = vi.fn((definition: unknown) => definition);

    return {
        app,
        createBackgroundApp,
        registerBackgroundRuntimeMessageBus,
        restrictBrowserSessionStorageToTrustedContexts,
        defineBackground,
        reset() {
            app.notifications.registerHandlers.mockReset();
            app.downloads.registerHandlers.mockReset();
            app.signalr.handleAlarm.mockReset().mockResolvedValue(true);
            app.runtimeMessageHandlers.testNotification
                .mockReset()
                .mockResolvedValue({ success: true });
            app.ensureReady.mockReset().mockResolvedValue(undefined);
            createBackgroundApp.mockReset().mockReturnValue(app);
            registerBackgroundRuntimeMessageBus.mockReset();
            restrictBrowserSessionStorageToTrustedContexts.mockReset().mockResolvedValue(undefined);
            defineBackground.mockReset().mockImplementation((definition: unknown) => definition);
        },
    };
});

vi.mock('wxt/utils/define-background', () => ({
    defineBackground: entrypointMocks.defineBackground,
}));

vi.mock('../../../src/app/background/create-background-services', () => ({
    createBackgroundApp: entrypointMocks.createBackgroundApp,
}));

vi.mock('../../../src/app/background/background-message-bus', () => ({
    registerBackgroundRuntimeMessageBus: entrypointMocks.registerBackgroundRuntimeMessageBus,
}));

vi.mock('../../../src/shared/browser/storage-client', () => ({
    restrictBrowserSessionStorageToTrustedContexts:
        entrypointMocks.restrictBrowserSessionStorageToTrustedContexts,
}));

interface BackgroundDefinition {
    readonly type: 'module';
    main(): void;
}

describe('background entrypoint', () => {
    beforeEach(() => {
        resetFakeBrowser();
        entrypointMocks.reset();
        vi.resetModules();
    });

    it('registers worker lifecycle handlers and runs release-critical bootstraps', async () => {
        const definition = (await import('../../../entrypoints/background')).default as
            | BackgroundDefinition
            | undefined;

        expect(definition?.type).toBe('module');
        definition?.main();

        await vi.waitFor(() => {
            expect(
                entrypointMocks.restrictBrowserSessionStorageToTrustedContexts
            ).toHaveBeenCalledOnce();
            expect(entrypointMocks.app.ensureReady).toHaveBeenCalledWith('worker-start');
        });
        expect(entrypointMocks.createBackgroundApp).toHaveBeenCalledOnce();
        expect(entrypointMocks.app.notifications.registerHandlers).toHaveBeenCalledOnce();
        expect(entrypointMocks.app.downloads.registerHandlers).toHaveBeenCalledOnce();
        expect(entrypointMocks.registerBackgroundRuntimeMessageBus).toHaveBeenCalledWith({
            ensureReady: entrypointMocks.app.ensureReady,
            handlers: entrypointMocks.app.runtimeMessageHandlers,
        });

        await fakeBrowser.runtime.onInstalled.trigger({
            reason: 'install',
            temporary: false,
        });
        await fakeBrowser.runtime.onStartup.trigger();
        await fakeBrowser.alarms.onAlarm.trigger({
            name: 'signalr-reconnect',
            scheduledTime: Date.now(),
        });

        await vi.waitFor(() => {
            expect(entrypointMocks.app.ensureReady).toHaveBeenCalledWith('runtime-installed');
            expect(entrypointMocks.app.ensureReady).toHaveBeenCalledWith('runtime-startup');
            expect(entrypointMocks.app.ensureReady).toHaveBeenCalledWith('alarm:signalr-reconnect');
            expect(entrypointMocks.app.signalr.handleAlarm).toHaveBeenCalledWith({
                name: 'signalr-reconnect',
                scheduledTime: expect.any(Number),
            });
        });
    });
});
