import { browser } from 'wxt/browser';

import { getAiChatTargetHost } from '../../entities/ai/chat-url';
import type { AiProviderId } from '../../entities/ai/model';
import {
    AI_PROVIDER_HOST_PERMISSIONS,
    getAiProviderHostPermission,
    isUnsafeDirectAiEnabled,
} from '../../features/proposals/ai-provider-host-permissions';

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
    } catch {
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
    } catch {
        return false;
    }
}

export { AI_PROVIDER_HOST_PERMISSIONS, getAiProviderHostPermission, isUnsafeDirectAiEnabled };

export async function hasAiProviderHostPermission(providerId: AiProviderId): Promise<boolean> {
    const origin = getAiProviderHostPermission(providerId);

    if (!browser.permissions?.contains) {
        return false;
    }

    return browser.permissions.contains({ origins: [origin] });
}

export async function requestAiProviderHostPermission(providerId: AiProviderId): Promise<boolean> {
    const origin = getAiProviderHostPermission(providerId);

    if (!browser.permissions?.request) {
        return false;
    }

    return browser.permissions.request({ origins: [origin] });
}
