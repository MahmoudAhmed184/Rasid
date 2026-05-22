import { describe, expect, it, vi } from 'vitest';

import { OFFSCREEN_RPC_CHANNEL } from '../../../../src/features/offscreen/manager';
import { fakeBrowser } from '../../../support/fake-browser';

async function loadFreshOffscreenBootstrap() {
    vi.resetModules();
    return import('../../../../src/app/offscreen/bootstrap-offscreen');
}

async function triggerOffscreenMessage(message: unknown, sender: Browser.runtime.MessageSender) {
    const responses: unknown[] = [];

    await fakeBrowser.runtime.onMessage.trigger(message, sender, (response: unknown) => {
        responses.push(response);
    });

    return responses;
}

describe('offscreen bootstrap', () => {
    it('registers the offscreen message listener once and ignores non-RPC messages', async () => {
        const { initOffscreen } = await loadFreshOffscreenBootstrap();

        initOffscreen();
        initOffscreen();

        await expect(
            triggerOffscreenMessage({ action: 'not-offscreen' }, { id: fakeBrowser.runtime.id })
        ).resolves.toEqual([]);
    });

    it('rejects untrusted offscreen senders', async () => {
        const { initOffscreen } = await loadFreshOffscreenBootstrap();

        initOffscreen();
        const responses = await triggerOffscreenMessage(
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: 'rpc-1',
                task: 'downloads.revoke-object-url',
                payload: { objectUrl: 'blob:zip' },
            },
            { id: 'different-extension' }
        );

        expect(responses).toEqual([
            {
                task: 'downloads.revoke-object-url',
                requestId: 'rpc-1',
                ok: false,
                error: 'Untrusted offscreen message sender.',
            },
        ]);
    });

    it('rejects messages sent from extension tabs instead of the offscreen document', async () => {
        const { initOffscreen } = await loadFreshOffscreenBootstrap();

        initOffscreen();
        const responses = await triggerOffscreenMessage(
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: 'rpc-tab',
                task: 'downloads.revoke-object-url',
                payload: { objectUrl: 'blob:zip' },
            },
            {
                id: fakeBrowser.runtime.id,
                tab: { id: 1 } as Browser.tabs.Tab,
            }
        );

        expect(responses).toEqual([
            {
                task: 'downloads.revoke-object-url',
                requestId: 'rpc-tab',
                ok: false,
                error: 'Untrusted offscreen message sender.',
            },
        ]);
    });

    it('dispatches trusted ZIP tasks and reports handler failures as transport errors', async () => {
        const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((objectUrl) => {
            if (objectUrl === 'blob:bad') {
                throw new Error('bad object URL');
            }
        });
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
        const { initOffscreen } = await loadFreshOffscreenBootstrap();

        initOffscreen();

        const createResponses = await triggerOffscreenMessage(
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: 'rpc-create',
                task: 'downloads.create-zip-url',
                payload: {
                    filename: 'archive.zip',
                    files: [{ name: 'readme.txt', content: 'hello' }],
                },
            },
            { id: fakeBrowser.runtime.id }
        );
        const revokeResponses = await triggerOffscreenMessage(
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: 'rpc-revoke',
                task: 'downloads.revoke-object-url',
                payload: { objectUrl: 'blob:zip' },
            },
            { id: fakeBrowser.runtime.id }
        );
        const failureResponses = await triggerOffscreenMessage(
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: 'rpc-fail',
                task: 'downloads.revoke-object-url',
                payload: { objectUrl: 'blob:bad' },
            },
            { id: fakeBrowser.runtime.id }
        );

        await vi.waitFor(() => expect(createResponses).toHaveLength(1));
        await vi.waitFor(() => expect(revokeResponses).toHaveLength(1));
        await vi.waitFor(() => expect(failureResponses).toHaveLength(1));
        expect(createResponses[0]).toMatchObject({
            task: 'downloads.create-zip-url',
            requestId: 'rpc-create',
            ok: true,
            data: {
                success: true,
                filename: 'archive.zip',
                objectUrl: 'blob:zip',
            },
        });
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:zip');
        expect(revokeResponses[0]).toEqual({
            task: 'downloads.revoke-object-url',
            requestId: 'rpc-revoke',
            ok: true,
            data: { success: true },
        });
        expect(failureResponses[0]).toEqual({
            task: 'downloads.revoke-object-url',
            requestId: 'rpc-fail',
            ok: false,
            error: 'bad object URL',
        });
    });

    it('dispatches trusted parser tasks and replies with transport responses', async () => {
        const { initOffscreen } = await loadFreshOffscreenBootstrap();

        initOffscreen();
        const listingResponses = await triggerOffscreenMessage(
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: 'rpc-listing',
                task: 'monitoring.parse-listing-html',
                payload: {
                    platformId: 'khamsat',
                    html: '<a href="/community/requests/7-test">طلب خمسات</a>',
                },
            },
            { id: fakeBrowser.runtime.id }
        );
        const responses = await triggerOffscreenMessage(
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: 'rpc-2',
                task: 'monitoring.parse-project-html',
                payload: { platformId: 'khamsat', html: '<main></main>' },
            },
            { id: fakeBrowser.runtime.id }
        );

        await vi.waitFor(() => expect(listingResponses).toHaveLength(1));
        await vi.waitFor(() => expect(responses).toHaveLength(1));
        expect(listingResponses[0]).toMatchObject({
            task: 'monitoring.parse-listing-html',
            requestId: 'rpc-listing',
            ok: true,
            data: [],
        });
        expect(responses[0]).toEqual({
            task: 'monitoring.parse-project-html',
            requestId: 'rpc-2',
            ok: true,
            data: null,
        });
    });

    it('plays notification audio through the offscreen task contract', async () => {
        const oscillator = {
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(function stop(this: { onended?: () => void }) {
                setTimeout(() => {
                    this.onended?.();
                }, 0);
            }),
            frequency: { value: 0 },
            type: 'sine',
            onended: undefined as (() => void) | undefined,
        };
        const audioContext = {
            state: 'running',
            currentTime: 0,
            destination: {},
            createOscillator: vi.fn(() => oscillator),
            createGain: vi.fn(() => ({
                connect: vi.fn(),
                gain: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
            })),
            resume: vi.fn(async () => undefined),
            close: vi.fn(async () => undefined),
        };
        class FakeAudioContext {
            readonly state = audioContext.state;
            readonly currentTime = audioContext.currentTime;
            readonly destination = audioContext.destination;
            readonly createOscillator = audioContext.createOscillator;
            readonly createGain = audioContext.createGain;
            readonly resume = audioContext.resume;
            readonly close = audioContext.close;
        }
        vi.stubGlobal('AudioContext', FakeAudioContext);
        const { initOffscreen } = await loadFreshOffscreenBootstrap();

        initOffscreen();
        const responses = await triggerOffscreenMessage(
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: 'rpc-audio',
                task: 'audio.play-notification',
                payload: {},
            },
            { id: fakeBrowser.runtime.id }
        );

        await vi.waitFor(() => expect(responses).toHaveLength(1));
        expect(audioContext.createOscillator).toHaveBeenCalledTimes(2);
        expect(audioContext.close).toHaveBeenCalledOnce();
        expect(responses[0]).toEqual({
            task: 'audio.play-notification',
            requestId: 'rpc-audio',
            ok: true,
            data: { success: true },
        });
    });
});
