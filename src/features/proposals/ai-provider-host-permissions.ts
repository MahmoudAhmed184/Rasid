import { browser } from 'wxt/browser';

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
