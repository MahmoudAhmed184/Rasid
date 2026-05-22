import { describe, expect, it } from 'vitest';

import { DEFAULT_PROMPTS } from '../../../../src/shared/storage/schema';
import { createProposalTemplateCatalog } from '../../../../src/features/proposals/proposal-template-catalog';

describe('proposal template catalog', () => {
    it('selects requested templates and attaches the shared system prompt', async () => {
        const catalog = createProposalTemplateCatalog({
            getPrompts: async () => [
                {
                    id: 'custom',
                    title: 'Custom',
                    content: 'Hello {title}',
                },
            ],
        });

        await expect(catalog.resolve('custom', 'System')).resolves.toEqual({
            id: 'custom',
            aiTemplate: {
                id: 'custom',
                name: 'Custom',
                system: 'System',
                user: 'Hello {title}',
            },
        });
    });

    it('falls back to default prompts when storage is empty', async () => {
        const catalog = createProposalTemplateCatalog({
            getPrompts: async () => [],
        });

        const resolved = await catalog.resolve('missing', 'System');

        expect(resolved?.id).toBe(DEFAULT_PROMPTS[0]?.id);
    });
});
