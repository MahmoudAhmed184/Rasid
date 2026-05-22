import { describe, expect, it, vi } from 'vitest';

import { createPromptRepository } from '../../../../src/features/proposals/prompt-repository';
import type { PromptTemplate } from '../../../../src/entities/prompt/model';
import type { ExtensionStorage } from '../../../../src/shared/storage/extension-storage';

function createStorage(initial: PromptTemplate[] = [{ id: 'a', title: 'A', content: 'One' }]) {
    let prompts = [...initial];
    return {
        getPrompts: vi.fn(async () => prompts.map((prompt) => ({ ...prompt }))),
        setPrompts: vi.fn(async (next: PromptTemplate[]) => {
            prompts = next.map((prompt) => ({ ...prompt }));
            return prompts.map((prompt) => ({ ...prompt }));
        }),
    } satisfies Pick<ExtensionStorage, 'getPrompts' | 'setPrompts'>;
}

describe('prompt repository', () => {
    it('lists and clones prompts by id', async () => {
        const storage = createStorage();
        const repository = createPromptRepository(storage as unknown as ExtensionStorage);

        const prompt = await repository.getById('a');
        expect(prompt).toEqual({ id: 'a', title: 'A', content: 'One' });
        if (prompt) {
            prompt.title = 'mutated';
        }
        expect(await repository.getById('a')).toEqual({ id: 'a', title: 'A', content: 'One' });
    });

    it('creates, updates, trims, and removes prompts', async () => {
        vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
        const storage = createStorage();
        const repository = createPromptRepository(storage as unknown as ExtensionStorage);

        await expect(repository.save({ title: ' New ', content: ' Body ' })).resolves.toEqual({
            id: '00000000-0000-4000-8000-000000000001',
            title: 'New',
            content: 'Body',
        });
        await expect(
            repository.save({ id: 'a', title: ' Updated ', content: ' Two ' })
        ).resolves.toEqual({
            id: 'a',
            title: 'Updated',
            content: 'Two',
        });
        await expect(repository.remove('a')).resolves.toHaveLength(1);
    });
});
