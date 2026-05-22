export const DEFAULT_AI_CHAT_URL = 'https://chatgpt.com/';
export const AI_CHAT_HOSTS = ['chatgpt.com', 'chat.openai.com'] as const;

export function isAllowedAiChatHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return AI_CHAT_HOSTS.some((allowedHost) => normalized === allowedHost);
}

export function normalizeAiChatUrl(value: unknown): string {
    const rawValue = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_AI_CHAT_URL;

    try {
        const url = new URL(rawValue, DEFAULT_AI_CHAT_URL);

        if (url.protocol !== 'https:' || !isAllowedAiChatHost(url.hostname)) {
            return DEFAULT_AI_CHAT_URL;
        }

        url.username = '';
        url.password = '';
        url.hash = '';

        return url.href;
    } catch {
        return DEFAULT_AI_CHAT_URL;
    }
}

export function getAiChatTargetHost(chatUrl: string): string {
    try {
        const url = new URL(normalizeAiChatUrl(chatUrl));
        return url.hostname.toLowerCase();
    } catch {
        return new URL(DEFAULT_AI_CHAT_URL).hostname;
    }
}
