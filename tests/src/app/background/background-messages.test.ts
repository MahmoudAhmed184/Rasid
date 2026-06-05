import { describe, expect, it, vi } from 'vitest';

import {
    createBackgroundTransportFailure,
    createBackgroundTransportSuccess,
    dispatchBackgroundMessage,
    getBackgroundMessageAction,
    isBackgroundRuntimeMessage,
    isBackgroundTransportResponseForAction,
    requestCheckNow,
    requestDebugFetch,
    requestDisconnectSignalR,
    requestDownloadZip,
    requestGenerateProposal,
    requestOpenChatBridgePrompt,
    requestReconnectSignalR,
    requestTestNotification,
    requestTestSound,
    requestUpdateAlarm,
    sendBackgroundMessage,
    type BackgroundMessageHandlerMap,
} from '../../../../src/app/background/background-messages';
import { fakeBrowser } from '../../../support/fake-browser';

const validContext = {
    title: 'بناء إضافة متصفح',
    description: 'وصف كاف لمشروع عربي يحتاج إلى عرض عمل.',
    url: 'https://mostaql.com/projects/123-extension',
    attachments: [
        {
            name: 'spec.pdf',
            url: 'https://mostaql.com/uploads/spec.pdf',
        },
    ],
};

describe('background message contracts', () => {
    it('accepts only known message actions', () => {
        expect(getBackgroundMessageAction({ action: 'checkNow' })).toBe('checkNow');
        expect(getBackgroundMessageAction({ action: 'deleteEverything' })).toBeNull();
        expect(getBackgroundMessageAction(null)).toBeNull();
    });

    it('validates generateProposal payload bounds and platform URLs', () => {
        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: validContext,
            })
        ).toBe(true);

        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: {
                    ...validContext,
                    url: 'https://evil.example/projects/123',
                },
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'openChatBridgePrompt',
                prompt: 'Draft proposal',
                chatUrl: 'https://chatgpt.com/',
            })
        ).toBe(true);

        expect(
            isBackgroundRuntimeMessage({
                action: 'openChatBridgePrompt',
                prompt: '',
                chatUrl: 'https://chatgpt.com/',
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'openChatBridgePrompt',
                prompt: 'Draft proposal',
                chatUrl: 'https://evil.example/',
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'x'.repeat(121),
                context: validContext,
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: {
                    ...validContext,
                    title: '',
                },
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: {
                    ...validContext,
                    description: 'x'.repeat(8_001),
                },
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: {
                    ...validContext,
                    tags: Array.from({ length: 31 }, (_, index) => `tag-${index}`),
                },
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: {
                    ...validContext,
                    attachments: Array.from({ length: 11 }, (_, index) => ({
                        name: `${index}.pdf`,
                        url: 'https://mostaql.com/uploads/spec.pdf',
                    })),
                },
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: {
                    ...validContext,
                    attachments: [{ name: 'evil.pdf', url: 'https://evil.example/spec.pdf' }],
                },
            })
        ).toBe(false);
    });

    it('validates generateProposal optional context fields and attachment edge cases', () => {
        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: {
                    ...validContext,
                    tags: Array.from({ length: 30 }, (_, index) => `وسم-${index}`),
                    budget: '500 دولار',
                    duration: '7 أيام',
                    clientName: 'عميل مستقل',
                    clientType: 'موثق',
                    category: 'تطوير',
                    publishDate: 'منذ ساعة',
                    projectId: '123',
                    projectStatus: 'open',
                    hiringRate: '75%',
                    openProjects: '2',
                    underwayProjects: '1',
                    clientJoined: '2024',
                    communications: '3',
                    attachments: Array.from({ length: 10 }, (_, index) => ({
                        name: `ملف-${index}.pdf`,
                        url: `https://sub.mostaql.com/uploads/${index}.pdf`,
                    })),
                },
            })
        ).toBe(true);

        expect(
            isBackgroundRuntimeMessage({
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: {
                    ...validContext,
                    tags: 'برمجة, إضافة متصفح',
                },
            })
        ).toBe(true);

        for (const invalidContext of [
            { ...validContext, url: 'http://mostaql.com/projects/123' },
            { ...validContext, clientName: 'x'.repeat(1_001) },
            { ...validContext, tags: ['x'.repeat(1_001)] },
            { ...validContext, tags: [1, 2, 3] },
            {
                ...validContext,
                attachments: [{ name: '', url: 'https://mostaql.com/uploads/spec.pdf' }],
            },
            {
                ...validContext,
                attachments: [
                    {
                        name: 'x'.repeat(201),
                        url: 'https://mostaql.com/uploads/spec.pdf',
                    },
                ],
            },
            {
                ...validContext,
                attachments: [{ name: 'spec.pdf', url: 'not-a-url' }],
            },
        ] satisfies unknown[]) {
            expect(
                isBackgroundRuntimeMessage({
                    action: 'generateProposal',
                    templateId: 'default_proposal',
                    context: invalidContext,
                })
            ).toBe(false);
        }
    });

    it('validates downloadZip message shape and file-count bounds', () => {
        expect(
            isBackgroundRuntimeMessage({
                action: 'downloadZip',
                filename: 'project.zip',
                files: [{ name: 'readme.txt', content: 'hello' }],
            })
        ).toBe(true);

        expect(
            isBackgroundRuntimeMessage({
                action: 'downloadZip',
                filename: 'project.zip',
                files: Array.from({ length: 81 }, (_, index) => ({
                    name: `${index}.txt`,
                    content: 'x',
                })),
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'downloadZip',
                filename: '',
                files: [{ name: 'readme.txt', content: 'hello' }],
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'downloadZip',
                filename: 'project.zip',
                files: [{ name: 'empty.txt' }],
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'downloadZip',
                filename: 'remote.zip',
                files: [{ name: 'remote.txt', url: 'https://mostaql.com/uploads/remote.txt' }],
            })
        ).toBe(true);

        expect(
            isBackgroundRuntimeMessage({
                action: 'downloadZip',
                filename: 'bad.zip',
                files: [{ name: 123, content: 'hello' }],
            })
        ).toBe(false);

        expect(
            isBackgroundRuntimeMessage({
                action: 'downloadZip',
                filename: 'bad.zip',
                files: [{ name: 'readme.txt', content: 123 }],
            })
        ).toBe(false);

        expect(isBackgroundRuntimeMessage({ action: 'updateAlarm', interval: Number.NaN })).toBe(
            false
        );
        expect(isBackgroundRuntimeMessage({ action: 'updateAlarm' })).toBe(true);
        expect(isBackgroundRuntimeMessage({ action: 'updateAlarm', interval: '5' })).toBe(false);
    });

    it('validates transport success and failure responses by action', () => {
        const success = createBackgroundTransportSuccess('testSound', { success: true });
        const failure = createBackgroundTransportFailure('testSound', 'boom');

        expect(isBackgroundTransportResponseForAction(success, 'testSound')).toBe(true);
        expect(isBackgroundTransportResponseForAction(failure, 'testSound')).toBe(true);
        expect(
            isBackgroundTransportResponseForAction(
                { ok: true, action: 'testSound', data: { success: false } },
                'testSound'
            )
        ).toBe(false);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'checkNow',
                    data: {
                        kind: 'published',
                        source: 'signalr',
                        totalChecked: 10,
                        newJobs: 2,
                        notificationsSent: true,
                    },
                },
                'checkNow'
            )
        ).toBe(true);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'checkNow',
                    data: {
                        kind: 'failed',
                        source: 'polling',
                        totalChecked: 10,
                        reason: 'fetch-failed',
                        monitoringErrors: {
                            mostaql: {
                                message: 'مستقل: Request failed with HTTP 403.',
                                failedAt: '2026-05-22T12:00:00.000Z',
                            },
                        },
                    },
                },
                'checkNow'
            )
        ).toBe(true);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'checkNow',
                    data: {
                        kind: 'suppressed',
                        source: 'polling',
                        totalChecked: 10,
                        suppressed: 2,
                    },
                },
                'checkNow'
            )
        ).toBe(true);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'checkNow',
                    data: {
                        kind: 'noop',
                        source: 'polling',
                        totalChecked: 10,
                        reason: 'unexpected',
                    },
                },
                'checkNow'
            )
        ).toBe(false);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'generateProposal',
                    data: {
                        success: true,
                        mode: 'bridge',
                        prompt: 'Draft',
                        chatUrl: 'https://chatgpt.com/',
                    },
                },
                'generateProposal'
            )
        ).toBe(true);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'generateProposal',
                    data: {
                        success: true,
                        mode: 'bridge',
                        prompt: 'Draft',
                        chatUrl: 'https://evil.example/',
                    },
                },
                'generateProposal'
            )
        ).toBe(false);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'openChatBridgePrompt',
                    data: {
                        success: true,
                        tabId: 7,
                        tabStatus: 'created',
                        injected: true,
                    },
                },
                'openChatBridgePrompt'
            )
        ).toBe(true);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'openChatBridgePrompt',
                    data: {
                        success: false,
                        reason: 'permission-denied',
                    },
                },
                'openChatBridgePrompt'
            )
        ).toBe(true);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'openChatBridgePrompt',
                    data: {
                        success: false,
                        reason: 'unknown',
                    },
                },
                'openChatBridgePrompt'
            )
        ).toBe(false);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'generateProposal',
                    data: {
                        success: true,
                        mode: 'direct',
                        proposal: 'سأبدأ بتنفيذ المشروع',
                        provider: 'openai',
                        model: 'gpt-test',
                    },
                },
                'generateProposal'
            )
        ).toBe(true);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'generateProposal',
                    data: {
                        success: true,
                        mode: 'direct',
                        proposal: 'missing provider',
                        model: 'gpt-test',
                    },
                },
                'generateProposal'
            )
        ).toBe(false);

        expect(
            isBackgroundTransportResponseForAction(
                {
                    ok: true,
                    action: 'generateProposal',
                    data: {
                        success: false,
                    },
                },
                'generateProposal'
            )
        ).toBe(false);

        expect(
            isBackgroundTransportResponseForAction(
                { ok: true, action: 'debugFetch', data: { success: true, length: 0 } },
                'debugFetch'
            )
        ).toBe(true);

        expect(
            isBackgroundTransportResponseForAction(
                { ok: true, action: 'debugFetch', data: { success: true, length: Number.NaN } },
                'debugFetch'
            )
        ).toBe(false);

        expect(
            isBackgroundTransportResponseForAction(
                { ok: true, action: 'debugFetch', data: { success: false, error: 404 } },
                'debugFetch'
            )
        ).toBe(false);

        expect(
            isBackgroundTransportResponseForAction(
                { ok: true, action: 'downloadZip', data: { success: false, error: 'zip failed' } },
                'downloadZip'
            )
        ).toBe(true);

        expect(
            isBackgroundTransportResponseForAction(
                { ok: true, action: 'downloadZip', data: { success: true, downloadId: '1' } },
                'downloadZip'
            )
        ).toBe(false);

        expect(isBackgroundTransportResponseForAction(null, 'testSound')).toBe(false);
        expect(isBackgroundTransportResponseForAction(success, 'testNotification')).toBe(false);
        expect(
            isBackgroundTransportResponseForAction(
                { ok: false, action: 'testSound', error: 123 },
                'testSound'
            )
        ).toBe(false);
    });

    it('dispatches validated messages to the matching handler', async () => {
        const handlers: BackgroundMessageHandlerMap = {
            checkNow: () => ({
                kind: 'noop',
                source: 'polling',
                reason: 'no-new-jobs',
                totalChecked: 0,
            }),
            testNotification: () => ({ success: true }),
            testSound: () => ({ success: true }),
            updateAlarm: (message) => {
                expect(message.interval).toBe(5);
                return { success: true };
            },
            reconnectSignalR: () => ({ success: true }),
            disconnectSignalR: () => ({ success: true }),
            debugFetch: () => ({ success: true, length: 10 }),
            generateProposal: () => ({ success: false, error: 'not needed' }),
            openChatBridgePrompt: () => ({
                success: true,
                tabId: 3,
                tabStatus: 'focused',
                injected: true,
            }),
            downloadZip: () => ({ success: true, downloadId: 1 }),
        };

        expect(dispatchBackgroundMessage(handlers, { action: 'updateAlarm', interval: 5 })).toEqual(
            {
                success: true,
            }
        );
        expect(dispatchBackgroundMessage(handlers, { action: 'checkNow' })).toMatchObject({
            kind: 'noop',
        });
        expect(dispatchBackgroundMessage(handlers, { action: 'testNotification' })).toEqual({
            success: true,
        });
        expect(dispatchBackgroundMessage(handlers, { action: 'testSound' })).toEqual({
            success: true,
        });
        expect(dispatchBackgroundMessage(handlers, { action: 'reconnectSignalR' })).toEqual({
            success: true,
        });
        expect(dispatchBackgroundMessage(handlers, { action: 'disconnectSignalR' })).toEqual({
            success: true,
        });
        expect(dispatchBackgroundMessage(handlers, { action: 'debugFetch' })).toEqual({
            success: true,
            length: 10,
        });
        expect(
            dispatchBackgroundMessage(handlers, {
                action: 'generateProposal',
                templateId: 'default_proposal',
                context: validContext,
            })
        ).toEqual({ success: false, error: 'not needed' });
        expect(
            dispatchBackgroundMessage(handlers, {
                action: 'downloadZip',
                filename: 'export.zip',
                files: [{ name: 'readme.txt', content: 'hello' }],
            })
        ).toEqual({ success: true, downloadId: 1 });
        expect(
            dispatchBackgroundMessage(handlers, {
                action: 'openChatBridgePrompt',
                prompt: 'Draft',
                chatUrl: 'https://chatgpt.com/',
            })
        ).toEqual({
            success: true,
            tabId: 3,
            tabStatus: 'focused',
            injected: true,
        });
    });

    it('sends request wrappers through browser.runtime and rejects malformed transports', async () => {
        const sendMessage = vi.spyOn(fakeBrowser.runtime, 'sendMessage');
        sendMessage.mockImplementation(async (message: unknown) => {
            const action = getBackgroundMessageAction(message);

            if (!action) {
                return { ok: false, action: 'checkNow', error: 'unknown action' };
            }

            switch (action) {
                case 'checkNow':
                    return createBackgroundTransportSuccess('checkNow', {
                        kind: 'noop',
                        source: 'polling',
                        reason: 'no-new-jobs',
                        totalChecked: 0,
                    });
                case 'testNotification':
                case 'testSound':
                case 'updateAlarm':
                case 'reconnectSignalR':
                case 'disconnectSignalR':
                    return createBackgroundTransportSuccess(action, { success: true });
                case 'debugFetch':
                    return createBackgroundTransportSuccess('debugFetch', {
                        success: true,
                        length: 123,
                    });
                case 'generateProposal':
                    return createBackgroundTransportSuccess('generateProposal', {
                        success: false,
                        error: 'provider unavailable',
                    });
                case 'openChatBridgePrompt':
                    return createBackgroundTransportSuccess('openChatBridgePrompt', {
                        success: true,
                        tabId: 11,
                        tabStatus: 'created',
                        injected: true,
                    });
                case 'downloadZip':
                    return createBackgroundTransportSuccess('downloadZip', {
                        success: true,
                        downloadId: 42,
                    });
            }
        });

        await expect(requestCheckNow()).resolves.toMatchObject({ kind: 'noop' });
        await expect(requestTestNotification()).resolves.toEqual({ success: true });
        await expect(requestTestSound()).resolves.toEqual({ success: true });
        await expect(requestUpdateAlarm(7)).resolves.toEqual({ success: true });
        await expect(requestReconnectSignalR()).resolves.toEqual({ success: true });
        await expect(requestDisconnectSignalR()).resolves.toEqual({ success: true });
        await expect(requestDebugFetch()).resolves.toEqual({ success: true, length: 123 });
        await expect(
            requestGenerateProposal({
                templateId: 'default_proposal',
                context: validContext,
            })
        ).resolves.toEqual({ success: false, error: 'provider unavailable' });
        await expect(requestOpenChatBridgePrompt('Draft', 'https://chatgpt.com')).resolves.toEqual({
            success: true,
            tabId: 11,
            tabStatus: 'created',
            injected: true,
        });
        await expect(
            requestDownloadZip('export.zip', [{ name: 'readme.txt', content: 'hello' }])
        ).resolves.toEqual({ success: true, downloadId: 42 });

        expect(sendMessage).toHaveBeenCalledWith({ action: 'updateAlarm', interval: 7 });
        expect(sendMessage).toHaveBeenCalledWith({
            action: 'openChatBridgePrompt',
            prompt: 'Draft',
            chatUrl: 'https://chatgpt.com/',
        });
        expect(sendMessage).toHaveBeenCalledWith({
            action: 'downloadZip',
            filename: 'export.zip',
            files: [{ name: 'readme.txt', content: 'hello' }],
        });

        sendMessage.mockResolvedValueOnce({ ok: false, action: 'testSound', error: 'boom' });
        await expect(requestTestSound()).rejects.toThrow('boom');

        sendMessage.mockResolvedValueOnce({
            ok: true,
            action: 'testSound',
            data: { success: false },
        });
        await expect(sendBackgroundMessage({ action: 'testSound' })).rejects.toThrow(
            'Invalid background response for testSound.'
        );
    });
});
