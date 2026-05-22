import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createPromptModal,
    loadPrompts,
    savePrompt,
} from '../../../../../src/platforms/mostaql/content/prompts';
import type {
    PlatformContentServices,
    PlatformPromptDraft,
} from '../../../../../src/platforms/contracts';
import { installTestDom } from '../../../../support/html';

function installPromptDom(): Document {
    const document = installTestDom();
    Object.defineProperty(window, 'alert', {
        configurable: true,
        value: vi.fn(),
    });
    Object.defineProperty(globalThis, 'alert', {
        configurable: true,
        value: vi.fn(),
    });

    return document;
}

function createPromptServices() {
    const prompts = [
        {
            id: 'default_proposal',
            title: 'القالب الافتراضي',
            content: 'اكتب عرضا لـ {title}',
        },
    ];
    const list = vi.fn(async () => prompts);
    const save = vi.fn(async (draft: PlatformPromptDraft) => ({
        id: draft.id ?? 'saved-template',
        title: draft.title,
        content: draft.content,
    }));
    const services: PlatformContentServices['prompts'] = {
        list,
        save,
    };

    return {
        services,
        list,
        save,
    };
}

function getModal(): HTMLElement {
    const modal = document.getElementById('mostaql-prompt-modal');

    if (!(modal instanceof HTMLElement)) {
        throw new Error('Expected prompt modal.');
    }

    return modal;
}

describe('Mostaql prompt content helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads prompt templates through the platform service callback', async () => {
        installPromptDom();
        const prompts = createPromptServices();
        const callback = vi.fn();

        loadPrompts(prompts.services, callback);

        await vi.waitFor(() => {
            expect(callback).toHaveBeenCalledWith([
                {
                    id: 'default_proposal',
                    title: 'القالب الافتراضي',
                    content: 'اكتب عرضا لـ {title}',
                },
            ]);
        });
        expect(prompts.list).toHaveBeenCalledOnce();
    });

    it('saves prompt drafts and returns the saved id to the callback', async () => {
        installPromptDom();
        const prompts = createPromptServices();
        const callback = vi.fn();

        savePrompt(
            prompts.services,
            {
                id: 'default_proposal',
                title: 'قالب معدل',
                content: 'نص معدل',
            },
            callback
        );

        await vi.waitFor(() => {
            expect(prompts.save).toHaveBeenCalledWith({
                id: 'default_proposal',
                title: 'قالب معدل',
                content: 'نص معدل',
            });
            expect(callback).toHaveBeenCalledWith('default_proposal');
        });
    });

    it('renders a single modal, validates required fields, and persists edited prompts', async () => {
        installPromptDom();
        const prompts = createPromptServices();
        const onSave = vi.fn();

        createPromptModal(prompts.services, onSave, {
            id: 'default_proposal',
            title: 'عنوان قديم',
            content: 'محتوى قديم',
        });
        createPromptModal(prompts.services, onSave, null);

        expect(document.querySelectorAll('#mostaql-prompt-modal')).toHaveLength(1);
        const modal = getModal();
        const titleInput = modal.querySelector<HTMLInputElement>('input');
        const contentInput = modal.querySelector<HTMLTextAreaElement>('textarea');
        const saveButton = [...modal.querySelectorAll('button')].find((button) =>
            button.textContent?.includes('حفظ')
        );

        expect(titleInput?.value).toBe('عنوان قديم');
        expect(contentInput?.value).toBe('محتوى قديم');

        titleInput!.value = '';
        contentInput!.value = '';
        saveButton?.click();
        expect(window.alert).toHaveBeenCalledWith('يرجى ملء جميع الحقول');
        expect(prompts.save).not.toHaveBeenCalled();

        titleInput!.value = 'عنوان جديد';
        contentInput!.value = 'محتوى جديد';
        saveButton?.click();

        await vi.waitFor(() => {
            expect(prompts.save).toHaveBeenCalledWith({
                id: 'default_proposal',
                title: 'عنوان جديد',
                content: 'محتوى جديد',
            });
            expect(onSave).toHaveBeenCalledWith('default_proposal');
            expect(document.getElementById('mostaql-prompt-modal')).toBeNull();
        });
    });

    it('cancels unsaved modal edits without calling storage', () => {
        installPromptDom();
        const prompts = createPromptServices();

        createPromptModal(prompts.services);
        const cancelButton = [...getModal().querySelectorAll('button')].find((button) =>
            button.textContent?.includes('إلغاء')
        );
        cancelButton?.click();

        expect(prompts.save).not.toHaveBeenCalled();
        expect(document.getElementById('mostaql-prompt-modal')).toBeNull();
    });
});
