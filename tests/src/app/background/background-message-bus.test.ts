import { describe, expect, it, vi } from 'vitest';

import { registerBackgroundRuntimeMessageBus } from '../../../../src/app/background/background-message-bus';
import {
    type BackgroundMessageHandlerMap,
    type BackgroundTransportResponse,
} from '../../../../src/app/background/background-messages';
import { OFFSCREEN_RPC_CHANNEL } from '../../../../src/features/offscreen/manager';
import { fakeBrowser } from '../../../support/fake-browser';

function createHandlers(): BackgroundMessageHandlerMap {
    return {
        checkNow: () => ({
            kind: 'noop',
            source: 'polling',
            reason: 'no-new-jobs',
            totalChecked: 0,
        }),
        testNotification: () => ({ success: true }),
        testSound: () => ({ success: true }),
        updateAlarm: () => ({ success: true }),
        reconnectSignalR: () => ({ success: true }),
        disconnectSignalR: () => ({ success: true }),
        debugFetch: () => ({ success: true, length: 1 }),
        generateProposal: () => ({ success: false, error: 'not used' }),
        downloadZip: () => ({ success: true, downloadId: 7 }),
    };
}

async function triggerRuntimeMessage(
    message: unknown,
    sender: Browser.runtime.MessageSender
): Promise<unknown[]> {
    const responses: unknown[] = [];

    await fakeBrowser.runtime.onMessage.trigger(message, sender, (response: unknown) => {
        responses.push(response);
    });

    return responses;
}

describe('background runtime message bus', () => {
    it('accepts trusted extension-page senders and dispatches valid messages', async () => {
        const ensureReady = vi.fn(async () => undefined);
        registerBackgroundRuntimeMessageBus({
            ensureReady,
            handlers: createHandlers(),
        });

        const responses = await triggerRuntimeMessage(
            { action: 'testSound' },
            {
                id: fakeBrowser.runtime.id,
                url: fakeBrowser.runtime.getURL('/popup.html'),
            }
        );

        await vi.waitFor(() => expect(responses).toHaveLength(1));
        expect(ensureReady).toHaveBeenCalledWith('message:testSound');
        expect(responses[0]).toEqual({
            ok: true,
            action: 'testSound',
            data: { success: true },
        } satisfies BackgroundTransportResponse<'testSound'>);
    });

    it('accepts trusted supported content-script hosts', async () => {
        registerBackgroundRuntimeMessageBus({
            ensureReady: async () => undefined,
            handlers: createHandlers(),
        });

        const responses = await triggerRuntimeMessage(
            { action: 'testNotification' },
            {
                id: fakeBrowser.runtime.id,
                url: 'https://sub.mostaql.com/project/1',
            }
        );

        await vi.waitFor(() => expect(responses).toHaveLength(1));
        expect(responses[0]).toMatchObject({
            ok: true,
            action: 'testNotification',
        });
    });

    it('accepts same-extension runtime senders without URLs', async () => {
        registerBackgroundRuntimeMessageBus({
            ensureReady: async () => undefined,
            handlers: createHandlers(),
        });

        const responses = await triggerRuntimeMessage(
            { action: 'debugFetch' },
            { id: fakeBrowser.runtime.id }
        );

        await vi.waitFor(() => expect(responses).toHaveLength(1));
        expect(responses[0]).toEqual({
            ok: true,
            action: 'debugFetch',
            data: { success: true, length: 1 },
        } satisfies BackgroundTransportResponse<'debugFetch'>);
    });

    it('rejects untrusted extension IDs and malformed payloads', async () => {
        registerBackgroundRuntimeMessageBus({
            ensureReady: async () => undefined,
            handlers: createHandlers(),
        });

        const untrustedResponses = await triggerRuntimeMessage(
            { action: 'testSound' },
            {
                id: 'different-extension',
                url: fakeBrowser.runtime.getURL('/popup.html'),
            }
        );
        const malformedResponses = await triggerRuntimeMessage(
            { action: 'updateAlarm', interval: 'bad' },
            {
                id: fakeBrowser.runtime.id,
                url: fakeBrowser.runtime.getURL('/dashboard.html'),
            }
        );

        expect(untrustedResponses[0]).toEqual({
            ok: false,
            action: 'testSound',
            error: 'Untrusted message sender.',
        });
        expect(malformedResponses[0]).toEqual({
            ok: false,
            action: 'updateAlarm',
            error: 'Invalid message payload.',
        });
    });

    it('rejects malformed sender URLs and unsupported web origins', async () => {
        registerBackgroundRuntimeMessageBus({
            ensureReady: async () => undefined,
            handlers: createHandlers(),
        });

        const malformedUrlResponses = await triggerRuntimeMessage(
            { action: 'testSound' },
            {
                id: fakeBrowser.runtime.id,
                url: 'https://%',
            }
        );
        const unsupportedHostResponses = await triggerRuntimeMessage(
            { action: 'testSound' },
            {
                id: fakeBrowser.runtime.id,
                url: 'https://evil.example/project/1',
            }
        );
        const httpResponses = await triggerRuntimeMessage(
            { action: 'testSound' },
            {
                id: fakeBrowser.runtime.id,
                url: 'http://mostaql.com/project/1',
            }
        );

        expect(malformedUrlResponses[0]).toEqual({
            ok: false,
            action: 'testSound',
            error: 'Untrusted message sender.',
        });
        expect(unsupportedHostResponses[0]).toEqual({
            ok: false,
            action: 'testSound',
            error: 'Untrusted message sender.',
        });
        expect(httpResponses[0]).toEqual({
            ok: false,
            action: 'testSound',
            error: 'Untrusted message sender.',
        });
    });

    it('returns transport failures and logs when readiness checks fail', async () => {
        const logger = {
            error: vi.fn(),
        };

        registerBackgroundRuntimeMessageBus({
            ensureReady: async () => {
                throw new Error('storage unavailable');
            },
            handlers: createHandlers(),
            logger,
        });

        const responses = await triggerRuntimeMessage(
            { action: 'testNotification' },
            {
                id: fakeBrowser.runtime.id,
                url: fakeBrowser.runtime.getURL('/popup.html'),
            }
        );

        await vi.waitFor(() => expect(responses).toHaveLength(1));
        expect(responses[0]).toEqual({
            ok: false,
            action: 'testNotification',
            error: 'storage unavailable',
        });
        expect(logger.error).toHaveBeenCalledWith(
            '[background] runtime message failed',
            expect.any(Error)
        );
    });

    it('ignores unknown actions and offscreen RPC envelopes synchronously', async () => {
        const ensureReady = vi.fn(async () => undefined);
        registerBackgroundRuntimeMessageBus({
            ensureReady,
            handlers: createHandlers(),
        });

        const unknownResponses = await triggerRuntimeMessage(
            { action: 'unknown' },
            { id: fakeBrowser.runtime.id }
        );
        const offscreenResponses = await triggerRuntimeMessage(
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: 'rpc-1',
                task: 'audio.play-notification',
                payload: {},
            },
            { id: fakeBrowser.runtime.id }
        );

        expect(unknownResponses).toEqual([]);
        expect(offscreenResponses).toEqual([]);
        expect(ensureReady).not.toHaveBeenCalled();
    });
});
