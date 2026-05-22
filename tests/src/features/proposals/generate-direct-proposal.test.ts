import { describe, expect, it } from 'vitest';

import {
    AiProviderError,
    type AiProviderAdapter,
} from '../../../../src/entities/ai/provider-adapter';
import type { AiProviderId } from '../../../../src/entities/ai/model';
import { generateDirectProposal } from '../../../../src/features/proposals/generate-direct-proposal';
import type { ResolvedProposalTemplate } from '../../../../src/features/proposals/proposal-template-catalog';

const template: ResolvedProposalTemplate = {
    id: 'default',
    aiTemplate: {
        id: 'default',
        name: 'Default',
        system: 'System',
        user: 'Project: {title}\n{description}',
    },
};

const context = {
    title: 'مشروع TypeScript',
    description: 'بناء اختبارات بدون اتصال خارجي.',
};

describe('direct proposal generation', () => {
    it.each([
        [
            'missing API key',
            { aiApiKey: '', aiModel: 'gpt-4.1', aiProvider: 'openai' as const },
            'Direct AI mode requires an API key.',
        ],
        [
            'missing model',
            { aiApiKey: 'secret', aiModel: '', aiProvider: 'openai' as const },
            'Direct AI mode requires a model name.',
        ],
        [
            'unsupported provider',
            { aiApiKey: 'secret', aiModel: 'model', aiProvider: 'claude' as const },
            'Unsupported AI provider: claude',
        ],
    ])('does not call providers for %s', async (_label, settings, error) => {
        const provider: AiProviderAdapter = {
            id: 'openai',
            async generate() {
                throw new Error('provider should not be called');
            },
        };

        await expect(
            generateDirectProposal(
                {
                    providers: {
                        openai: provider,
                    } as unknown as Record<AiProviderId, AiProviderAdapter>,
                },
                {
                    settings,
                    template,
                    context,
                }
            )
        ).resolves.toEqual({
            success: false,
            error,
        });
    });

    it('passes bounded generation settings and rendered prompts to the selected provider', async () => {
        const provider: AiProviderAdapter = {
            id: 'openai',
            async generate(request) {
                expect(request.maxOutputTokens).toBe(900);
                expect(request.temperature).toBe(0.4);
                expect(request.prompt.system).toBe('System');
                expect(request.prompt.user).toContain('[[BEGIN_UNTRUSTED_TITLE]]');
                return { output: 'proposal text' };
            },
        };

        const result = await generateDirectProposal(
            {
                providers: {
                    openai: provider,
                    gemini: provider,
                    claude: provider,
                },
            },
            {
                settings: {
                    aiApiKey: 'secret',
                    aiModel: 'gpt-4.1',
                    aiProvider: 'openai',
                },
                template,
                context,
            }
        );

        expect(result).toEqual({
            success: true,
            mode: 'direct',
            proposal: 'proposal text',
            provider: 'openai',
            model: 'gpt-4.1',
        });
    });

    it('formats provider errors without leaking raw thrown objects', async () => {
        const provider: AiProviderAdapter = {
            id: 'openai',
            async generate() {
                throw new AiProviderError({
                    provider: 'openai',
                    category: 'rate_limit',
                    message: 'Too many requests',
                    status: 429,
                    retryAfter: '30',
                });
            },
        };

        await expect(
            generateDirectProposal(
                {
                    providers: {
                        openai: provider,
                        gemini: provider,
                        claude: provider,
                    },
                },
                {
                    settings: {
                        aiApiKey: 'secret',
                        aiModel: 'gpt-4.1',
                        aiProvider: 'openai',
                    },
                    template,
                    context,
                }
            )
        ).resolves.toEqual({
            success: false,
            error: 'openai rate_limit: Too many requests (HTTP 429, retry after 30)',
        });
    });
});
