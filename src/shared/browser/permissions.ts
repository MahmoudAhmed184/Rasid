import { browser } from 'wxt/browser';

import { getAiChatTargetHost } from '../../entities/ai/chat-url';
import type { AiProviderId } from '../../entities/ai/model';

export const AI_PROVIDER_HOST_PERMISSIONS = {
    openai: 'https://api.openai.com/*',
    gemini: 'https://generativelanguage.googleapis.com/*',
    claude: 'https://api.anthropic.com/*',
} as const satisfies Record<AiProviderId, string>;

export function isUnsafeDirectAiEnabled(): boolean {
    return import.meta.env.WXT_ENABLE_UNSAFE_DIRECT_AI === 'true';
}

export function getAiProviderHostPermission(providerId: AiProviderId): string {
    return AI_PROVIDER_HOST_PERMISSIONS[providerId];
}

export function getChatBridgeHostPermission(chatUrl?: string): string {
    const host = chatUrl ? getAiChatTargetHost(chatUrl) : 'chatgpt.com';
    return `https://${host}/*`;
}

export async function hasChatBridgePermission(chatUrl?: string): Promise<boolean> {
    if (!browser.permissions?.contains) {
        return false;
    }

    try {
        const origin = getChatBridgeHostPermission(chatUrl);
        return (await browser.permissions.contains({ origins: [origin] })) ?? false;
    } catch (error) {
        console.warn('Failed to check chat bridge host permission:', error);
        return false;
    }
}

export async function requestChatBridgePermission(chatUrl?: string): Promise<boolean> {
    if (!browser.permissions?.request) {
        return false;
    }

    try {
        const origin = getChatBridgeHostPermission(chatUrl);
        return (await browser.permissions.request({ origins: [origin] })) ?? false;
    } catch (error) {
        console.warn('Failed to request chat bridge host permission:', error);
        return false;
    }
}

export async function hasAiProviderHostPermission(providerId: AiProviderId): Promise<boolean> {
    const origin = getAiProviderHostPermission(providerId);

    if (!browser.permissions?.contains) {
        return false;
    }

    try {
        return (await browser.permissions.contains({ origins: [origin] })) ?? false;
    } catch (error) {
        console.warn('Failed to check AI provider host permission:', error);
        return false;
    }
}

export async function requestAiProviderHostPermission(providerId: AiProviderId): Promise<boolean> {
    const origin = getAiProviderHostPermission(providerId);

    if (!browser.permissions?.request) {
        return false;
    }

    try {
        return (await browser.permissions.request({ origins: [origin] })) ?? false;
    } catch (error) {
        console.warn('Failed to request AI provider host permission:', error);
        return false;
    }
}
