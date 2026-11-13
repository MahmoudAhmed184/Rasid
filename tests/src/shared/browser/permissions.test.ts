import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from '../../../support/fake-browser';
import {
    getChatBridgeHostPermission,
    hasChatBridgePermission,
    requestChatBridgePermission,
    hasAiProviderHostPermission,
    requestAiProviderHostPermission,
    getAiProviderHostPermission,
} from '../../../../src/shared/browser/permissions';

describe('permissions helper', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('ChatGPT bridge host permissions', () => {
        it('normalizes chat URL to match origin pattern', () => {
            expect(getChatBridgeHostPermission('https://chatgpt.com/')).toBe(
                'https://chatgpt.com/*'
            );
            expect(getChatBridgeHostPermission('https://chat.openai.com/g/g-123')).toBe(
                'https://chat.openai.com/*'
            );
            expect(getChatBridgeHostPermission()).toBe('https://chatgpt.com/*');
        });

        it('checks whether chat host permission is granted', async () => {
            const containsSpy = vi
                .spyOn(fakeBrowser.permissions, 'contains')
                .mockResolvedValue(true as never);

            await expect(hasChatBridgePermission('https://chatgpt.com/')).resolves.toBe(true);
            expect(containsSpy).toHaveBeenCalledWith({
                origins: ['https://chatgpt.com/*'],
            });
        });

        it('requests chat host permission when requested', async () => {
            const requestSpy = vi
                .spyOn(fakeBrowser.permissions, 'request')
                .mockResolvedValue(true as never);

            await expect(requestChatBridgePermission('https://chatgpt.com/')).resolves.toBe(true);
            expect(requestSpy).toHaveBeenCalledWith({
                origins: ['https://chatgpt.com/*'],
            });
        });

        it('returns false when permissions API is unavailable', async () => {
            const originalContains = fakeBrowser.permissions.contains;
            const originalRequest = fakeBrowser.permissions.request;

            // @ts-expect-error force undefined for test
            fakeBrowser.permissions.contains = undefined;
            // @ts-expect-error force undefined for test
            fakeBrowser.permissions.request = undefined;

            try {
                await expect(hasChatBridgePermission('https://chatgpt.com/')).resolves.toBe(false);
                await expect(requestChatBridgePermission('https://chatgpt.com/')).resolves.toBe(
                    false
                );
            } finally {
                fakeBrowser.permissions.contains = originalContains;
                fakeBrowser.permissions.request = originalRequest;
            }
        });
    });

    describe('Direct AI provider permissions', () => {
        it('resolves correct origins for providers', () => {
            expect(getAiProviderHostPermission('openai')).toBe('https://api.openai.com/*');
            expect(getAiProviderHostPermission('gemini')).toBe(
                'https://generativelanguage.googleapis.com/*'
            );
            expect(getAiProviderHostPermission('claude')).toBe('https://api.anthropic.com/*');
        });

        it('checks and requests provider permissions', async () => {
            const containsSpy = vi
                .spyOn(fakeBrowser.permissions, 'contains')
                .mockResolvedValue(true as never);
            const requestSpy = vi
                .spyOn(fakeBrowser.permissions, 'request')
                .mockResolvedValue(true as never);

            await expect(hasAiProviderHostPermission('gemini')).resolves.toBe(true);
            expect(containsSpy).toHaveBeenCalledWith({
                origins: ['https://generativelanguage.googleapis.com/*'],
            });

            await expect(requestAiProviderHostPermission('claude')).resolves.toBe(true);
            expect(requestSpy).toHaveBeenCalledWith({
                origins: ['https://api.anthropic.com/*'],
            });
        });
    });
});
