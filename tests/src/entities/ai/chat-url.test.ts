import { describe, expect, it } from 'vitest';

import {
    AI_CHAT_HOSTS,
    DEFAULT_AI_CHAT_URL,
    getAiChatTargetHost,
    isAllowedAiChatHost,
    normalizeAiChatUrl,
} from '../../../../src/entities/ai/chat-url';

describe('AI chat URL normalization', () => {
    it('keeps allowed ChatGPT HTTPS hosts', () => {
        expect(normalizeAiChatUrl('https://chatgpt.com/g/g-123')).toBe(
            'https://chatgpt.com/g/g-123'
        );
        expect(normalizeAiChatUrl('https://chat.openai.com/?model=gpt-4')).toBe(
            'https://chat.openai.com/?model=gpt-4'
        );
    });

    it.each([
        ['empty string', ''],
        ['nullish', null],
        ['off origin', 'https://example.com/chatgpt.com'],
        ['insecure', 'http://chatgpt.com/'],
        ['javascript URL', 'javascript:alert(1)'],
    ] as const)('falls back for %s input', (_label, value) => {
        expect(normalizeAiChatUrl(value)).toBe(DEFAULT_AI_CHAT_URL);
    });

    it('strips credentials and fragments without changing the allowed host', () => {
        expect(normalizeAiChatUrl('https://user:secret@chatgpt.com/#frag')).toBe(
            'https://chatgpt.com/'
        );
    });

    it('normalizes target hosts for bridge routing', () => {
        expect(getAiChatTargetHost('https://CHAT.OPENAI.com/c/123')).toBe('chat.openai.com');
        expect(getAiChatTargetHost('https://example.com')).toBe('chatgpt.com');
    });

    it('keeps the supported host list constrained to ChatGPT surfaces', () => {
        expect(AI_CHAT_HOSTS).toEqual(['chatgpt.com', 'chat.openai.com']);
        expect(isAllowedAiChatHost('chatgpt.com')).toBe(true);
        expect(isAllowedAiChatHost('sub.chatgpt.com')).toBe(false);
    });
});
