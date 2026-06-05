import { describe, expect, it, vi } from 'vitest';

import type { AiProviderAdapter } from '../../../../src/entities/ai/provider-adapter';
import { DEFAULT_SETTINGS } from '../../../../src/shared/storage/schema';
import {
    createProposalGenerator,
    generateProposal,
} from '../../../../src/features/proposals/generate-proposal';

const context = {
    title: 'مشروع',
    description: 'وصف',
};

const template = {
    id: 'default',
    aiTemplate: {
        id: 'default',
        name: 'Default',
        system: 'System',
        user: '{title}\n{description}',
    },
};

describe('proposal generator', () => {
    it('returns a clear error for unknown templates', async () => {
        await expect(
            generateProposal(
                {
                    settings: {
                        getSettings: async () => DEFAULT_SETTINGS,
                    },
                    templates: {
                        resolve: async () => null,
                    },
                },
                'missing',
                context
            )
        ).resolves.toEqual({
            success: false,
            error: 'Unknown prompt template: missing',
        });
    });

    it('routes bridge mode without calling direct providers', async () => {
        const provider: AiProviderAdapter = {
            id: 'openai',
            generate: async () => {
                throw new Error('should not be called');
            },
        };

        const result = await generateProposal(
            {
                settings: {
                    getSettings: async () => ({
                        ...DEFAULT_SETTINGS,
                        aiExecutionMode: 'bridge',
                        aiChatUrl: 'https://chatgpt.com/g/g-123',
                    }),
                },
                templates: {
                    resolve: async () => template,
                },
                providers: {
                    openai: provider,
                    gemini: provider,
                    claude: provider,
                },
            },
            'default',
            context
        );

        expect(result).toMatchObject({
            success: true,
            mode: 'bridge',
            chatUrl: 'https://chatgpt.com/g/g-123',
        });
    });

    it('falls back to bridge for stored direct mode in default builds', async () => {
        const provider: AiProviderAdapter = {
            id: 'gemini',
            generate: vi.fn(async () => ({ output: 'generated proposal' })),
        };

        await expect(
            generateProposal(
                {
                    settings: {
                        getSettings: async () => ({
                            ...DEFAULT_SETTINGS,
                            aiExecutionMode: 'direct',
                            aiProvider: 'gemini',
                            aiApiKey: 'secret',
                            aiModel: 'gemini-model',
                        }),
                    },
                    templates: {
                        resolve: async () => template,
                    },
                    providers: {
                        openai: provider,
                        gemini: provider,
                        claude: provider,
                    },
                },
                'default',
                context
            )
        ).resolves.toMatchObject({
            success: true,
            mode: 'bridge',
        });
        expect(provider.generate).not.toHaveBeenCalled();
    });

    it('passes the configured system prompt to template resolution and exposes reusable generators', async () => {
        const provider: AiProviderAdapter = {
            id: 'openai',
            generate: vi.fn(async () => ({ output: 'generated via factory' })),
        };
        const resolve = vi.fn(async () => template);
        const generator = createProposalGenerator({
            settings: {
                getSettings: async () => ({
                    ...DEFAULT_SETTINGS,
                    aiExecutionMode: 'direct',
                    aiProvider: 'openai',
                    aiApiKey: 'secret',
                    aiModel: 'gpt-test',
                    aiSystemPrompt: 'custom trusted prompt',
                }),
            },
            templates: {
                resolve,
            },
            providers: {
                openai: provider,
                gemini: provider,
                claude: provider,
            },
        });

        await expect(generator.generate('default', context)).resolves.toMatchObject({
            success: true,
            mode: 'bridge',
        });
        expect(resolve).toHaveBeenCalledWith('default', 'custom trusted prompt');
        expect(provider.generate).not.toHaveBeenCalled();
    });

    it('blocks unsafe direct generation when provider host permission is denied', async () => {
        vi.stubEnv('WXT_ENABLE_UNSAFE_DIRECT_AI', 'true');
        const { browser } = await import('wxt/browser');
        vi.spyOn(browser.permissions, 'contains').mockImplementation(async () => false);
        const provider: AiProviderAdapter = {
            id: 'openai',
            generate: vi.fn(async () => ({ output: 'should not run' })),
        };

        await expect(
            generateProposal(
                {
                    settings: {
                        getSettings: async () => ({
                            ...DEFAULT_SETTINGS,
                            aiExecutionMode: 'direct',
                            aiProvider: 'openai',
                            aiApiKey: 'secret',
                            aiModel: 'gpt-test',
                        }),
                    },
                    templates: {
                        resolve: async () => template,
                    },
                    providers: {
                        openai: provider,
                        gemini: provider,
                        claude: provider,
                    },
                },
                'default',
                context
            )
        ).resolves.toEqual({
            success: false,
            error: 'Direct AI mode requires the provider host permission. Re-enable Direct mode from settings.',
        });
        expect(provider.generate).not.toHaveBeenCalled();
        vi.unstubAllEnvs();
    });
});
