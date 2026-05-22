import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    OFFSCREEN_RPC_CHANNEL,
    createOffscreenManager,
    createOffscreenTransportFailure,
    createOffscreenTransportSuccess,
    dispatchOffscreenTask,
    isOffscreenProtocolMessage,
    isOffscreenTransportResponseForTask,
    type OffscreenTaskEnvelope,
    type OffscreenTaskHandlerMap,
} from '../../../../src/features/offscreen/manager';
import { fakeBrowser } from '../../../support/fake-browser';

type OffscreenOptions = Parameters<typeof createOffscreenManager>[0];
const documentPath = '/offscreen.html' as OffscreenOptions['documentPath'];

afterEach(() => {
    Reflect.deleteProperty(globalThis, 'chrome');
});

describe('offscreen task protocol', () => {
    it('validates task envelopes by task-specific payload shape', () => {
        expect(
            isOffscreenProtocolMessage({
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: '1',
                task: 'downloads.create-zip-url',
                payload: {
                    filename: 'export.zip',
                    files: [{ name: 'readme.txt', content: 'hello' }],
                },
            })
        ).toBe(true);

        expect(
            isOffscreenProtocolMessage({
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: '1',
                task: 'downloads.create-zip-url',
                payload: {
                    filename: 'export.zip',
                    files: Array.from({ length: 81 }, (_, index) => ({
                        name: `${index}.txt`,
                        content: 'x',
                    })),
                },
            })
        ).toBe(false);
        expect(
            isOffscreenProtocolMessage({
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'content-script',
                requestId: '1',
                task: 'audio.play-notification',
                payload: {},
            })
        ).toBe(false);
    });

    it.each([
        [
            'audio payloads with extra fields',
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: '1',
                task: 'audio.play-notification',
                payload: { unexpected: true },
            },
        ],
        [
            'empty revoke payloads',
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: '1',
                task: 'downloads.revoke-object-url',
                payload: { objectUrl: '' },
            },
        ],
        [
            'zip entries without content or URL',
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: '1',
                task: 'downloads.create-zip-url',
                payload: {
                    filename: 'export.zip',
                    files: [{ name: 'empty.txt' }],
                },
            },
        ],
        [
            'unsupported monitoring platforms',
            {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: '1',
                task: 'monitoring.parse-listing-html',
                payload: { platformId: 'legacy', html: '<main></main>' },
            },
        ],
    ])('rejects %s', (_label, message) => {
        expect(isOffscreenProtocolMessage(message)).toBe(false);
    });

    it('validates transport responses by task and request id', () => {
        const success = createOffscreenTransportSuccess(
            'downloads.create-zip-url',
            {
                success: true,
                filename: 'export.zip',
                objectUrl: 'blob:zip',
            },
            'request-1'
        );
        const failure = createOffscreenTransportFailure(
            'downloads.create-zip-url',
            'failed',
            'request-1'
        );

        expect(
            isOffscreenTransportResponseForTask(success, 'downloads.create-zip-url', 'request-1')
        ).toBe(true);
        expect(
            isOffscreenTransportResponseForTask(failure, 'downloads.create-zip-url', 'request-1')
        ).toBe(true);
        expect(
            isOffscreenTransportResponseForTask(success, 'downloads.create-zip-url', 'wrong-id')
        ).toBe(false);
        expect(
            isOffscreenTransportResponseForTask(
                {
                    task: 'monitoring.parse-listing-html',
                    requestId: 'request-1',
                    ok: true,
                    data: [{ id: '1', title: 'missing url' }],
                },
                'monitoring.parse-listing-html',
                'request-1'
            )
        ).toBe(false);
        expect(
            isOffscreenTransportResponseForTask(
                {
                    task: 'monitoring.parse-project-html',
                    requestId: 'request-1',
                    ok: true,
                    data: { id: 1 },
                },
                'monitoring.parse-project-html',
                'request-1'
            )
        ).toBe(false);
    });

    it('dispatches local manager requests and fails unregistered local tasks', async () => {
        const manager = createOffscreenManager({
            mode: 'local',
            documentPath,
        });
        manager.registerLocalHandler('downloads.revoke-object-url', ({ objectUrl }) => {
            expect(objectUrl).toBe('blob:zip');
            return { success: true };
        });

        await expect(
            manager.request('downloads.revoke-object-url', { objectUrl: 'blob:zip' })
        ).resolves.toEqual({ success: true });
        await expect(manager.request('audio.play-notification', {})).rejects.toThrow(
            'No local offscreen handler registered'
        );
    });

    it('sends document-mode requests through browser runtime and rejects invalid responses', async () => {
        const manager = createOffscreenManager({
            mode: 'document',
            documentPath,
        });
        vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
            task: 'audio.play-notification',
            requestId: 'wrong',
            ok: true,
            data: { success: true },
        });

        await expect(manager.request('audio.play-notification', {})).rejects.toThrow(
            'Invalid offscreen response'
        );
    });

    it('sends document-mode requests and unwraps valid transport success and failure responses', async () => {
        const manager = createOffscreenManager({
            mode: 'document',
            documentPath,
        });
        vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(
            async (message: unknown) => {
                if (
                    isOffscreenProtocolMessage(message) &&
                    message.task === 'monitoring.parse-listing-html'
                ) {
                    return createOffscreenTransportSuccess(
                        'monitoring.parse-listing-html',
                        [
                            {
                                id: 'job-1',
                                platformId: message.payload.platformId,
                                title: 'Fixture job',
                                url: 'https://mostaql.com/projects/1-fixture',
                            },
                        ],
                        message.requestId
                    );
                }

                if (
                    isOffscreenProtocolMessage(message) &&
                    message.task === 'downloads.revoke-object-url'
                ) {
                    return createOffscreenTransportFailure(
                        'downloads.revoke-object-url',
                        'revoke failed',
                        message.requestId
                    );
                }

                return null;
            }
        );

        await expect(
            manager.request('monitoring.parse-listing-html', {
                platformId: 'mostaql',
                html: '<main></main>',
            })
        ).resolves.toEqual([
            {
                id: 'job-1',
                platformId: 'mostaql',
                title: 'Fixture job',
                url: 'https://mostaql.com/projects/1-fixture',
            },
        ]);
        await expect(
            manager.request('downloads.revoke-object-url', { objectUrl: 'blob:zip' })
        ).rejects.toThrow('revoke failed');
    });

    it('creates a Chrome offscreen document once and reuses existing contexts', async () => {
        const createDocumentResolvers: Array<() => void> = [];
        const getContexts = vi.fn(async () => [] as Array<Record<string, unknown>>);
        const createDocument = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    createDocumentResolvers.push(resolve);
                })
        );

        Object.defineProperty(globalThis, 'chrome', {
            configurable: true,
            value: {
                runtime: { getContexts },
                offscreen: { createDocument },
            },
        });

        const manager = createOffscreenManager({
            mode: 'document',
            documentPath,
        });

        const firstBootstrap = manager.bootstrap();
        const secondBootstrap = manager.bootstrap();

        await vi.waitFor(() => expect(createDocument).toHaveBeenCalledTimes(1));
        expect(createDocument).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'offscreen.html',
                reasons: expect.arrayContaining(['AUDIO_PLAYBACK', 'BLOBS', 'DOM_PARSER']),
            })
        );

        createDocumentResolvers.forEach((resolve) => {
            resolve();
        });
        await Promise.all([firstBootstrap, secondBootstrap]);

        getContexts.mockResolvedValueOnce([{}]);
        await manager.bootstrap();
        expect(createDocument).toHaveBeenCalledTimes(1);
    });

    it('dispatches raw task envelopes to the correct handler', () => {
        const handlers: OffscreenTaskHandlerMap = {
            'audio.play-notification': () => ({ success: true }),
            'downloads.create-zip-url': () => ({ success: false, error: 'not used' }),
            'downloads.revoke-object-url': () => ({ success: true }),
            'monitoring.parse-listing-html': () => [],
            'monitoring.parse-project-html': () => null,
        };

        expect(
            dispatchOffscreenTask(handlers, {
                channel: OFFSCREEN_RPC_CHANNEL,
                source: 'background',
                requestId: '1',
                task: 'monitoring.parse-project-html',
                payload: { platformId: 'mostaql', html: '<main></main>' },
            } satisfies OffscreenTaskEnvelope)
        ).toBeNull();
    });
});
