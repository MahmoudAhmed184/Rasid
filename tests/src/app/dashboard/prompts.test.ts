import { describe, expect, it, vi } from 'vitest';

import { createPromptManager } from '../../../../src/app/dashboard/prompts';
import type { PromptTemplate } from '../../../../src/entities/prompt/model';
import { installTestDom } from '../../../support/html';

function installPromptDom(): Document {
    const document = installTestDom(`
        <div class="dashboard-container">
            <button id="addPromptBtn" type="button"></button>
            <div id="promptsList"></div>
        </div>
        <div id="promptModal" class="hidden" hidden aria-hidden="true">
            <div class="modal-panel" tabindex="-1">
                <h2 id="modalTitle"></h2>
                <input id="promptId" />
                <input id="promptTitle" />
                <p id="promptTitleError" hidden></p>
                <textarea id="promptContent"></textarea>
                <p id="promptContentError" hidden></p>
                <p id="promptModalStatus" hidden></p>
                <button id="closeModalBtn" type="button"></button>
                <button id="confirmSavePrompt" type="button"></button>
            </div>
        </div>
    `);

    for (const prototype of [HTMLInputElement.prototype, HTMLTextAreaElement.prototype]) {
        Object.defineProperty(prototype, 'setCustomValidity', {
            configurable: true,
            value: vi.fn(),
        });
        Object.defineProperty(prototype, 'reportValidity', {
            configurable: true,
            value: vi.fn(() => true),
        });
        Object.defineProperty(prototype, 'select', {
            configurable: true,
            value: vi.fn(),
        });
    }
    Object.defineProperty(window, 'confirm', {
        configurable: true,
        value: vi.fn(() => true),
    });

    return document;
}

function createPromptRepository(initial: PromptTemplate[] = []) {
    let prompts = [...initial];

    return {
        list: vi.fn(async () => prompts.map((prompt) => ({ ...prompt }))),
        save: vi.fn(async (draft: { id?: string; title: string; content: string }) => {
            const prompt = {
                id: draft.id ?? `prompt-${prompts.length + 1}`,
                title: draft.title,
                content: draft.content,
            };

            prompts = draft.id
                ? prompts.map((entry) => (entry.id === draft.id ? prompt : entry))
                : [...prompts, prompt];

            return { ...prompt };
        }),
        remove: vi.fn(async (id: string) => {
            prompts = prompts.filter((prompt) => prompt.id !== id);
            return prompts.map((prompt) => ({ ...prompt }));
        }),
    };
}

function keyboardEvent(key: string, shiftKey = false): Event {
    const event = new Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', {
        configurable: true,
        value: key,
    });
    Object.defineProperty(event, 'shiftKey', {
        configurable: true,
        value: shiftKey,
    });
    return event;
}

describe('dashboard prompt manager', () => {
    it('renders empty state and prompt cards with accessible action labels', () => {
        const document = installPromptDom();
        const manager = createPromptManager(document, {
            promptRepository: createPromptRepository(),
        });

        manager.render([]);
        expect(document.querySelector('.empty-state')?.textContent).toContain('لا يوجد أوامر');

        manager.render([{ id: 'p1', title: 'عنوان الأمر', content: 'نص الأمر' }]);
        expect(document.querySelector('.prompt-card-title')?.textContent).toBe('عنوان الأمر');
        expect(document.querySelector('.prompt-card-content')?.textContent).toBe('نص الأمر');
        expect(document.querySelector('.btn-edit-prompt')?.getAttribute('aria-label')).toContain(
            'تعديل الأمر: عنوان الأمر'
        );
        expect(document.querySelector('.btn-delete-prompt')?.getAttribute('aria-label')).toContain(
            'حذف الأمر: عنوان الأمر'
        );
    });

    it('opens the modal, validates required fields, and saves new prompts', async () => {
        const document = installPromptDom();
        const promptRepository = createPromptRepository();
        const onSaved = vi.fn();
        const manager = createPromptManager(document, { promptRepository, onSaved });

        manager.bind();
        document.getElementById('addPromptBtn')?.click();

        expect(document.getElementById('promptModal')?.hidden).toBe(false);
        expect(document.getElementById('modalTitle')?.textContent).toBe('إضافة أمر جديد');

        document.getElementById('confirmSavePrompt')?.click();
        expect(document.getElementById('promptTitleError')?.textContent).toBe(
            'يرجى إدخال عنوان الأمر.'
        );
        expect(document.getElementById('promptModalStatus')?.textContent).toBe(
            'راجع الحقول المطلوبة قبل حفظ الأمر.'
        );

        (document.getElementById('promptTitle') as HTMLInputElement).value = '  جديد  ';
        (document.getElementById('promptContent') as HTMLTextAreaElement).value = '  نص  ';
        document.getElementById('confirmSavePrompt')?.click();

        await vi.waitFor(() =>
            expect(promptRepository.save).toHaveBeenCalledWith({
                id: undefined,
                title: 'جديد',
                content: 'نص',
            })
        );
        expect(document.getElementById('promptModal')?.hidden).toBe(true);
        expect(onSaved).toHaveBeenCalledOnce();
        expect(document.querySelector('.prompt-card-title')?.textContent).toBe('جديد');
    });

    it('edits existing prompts and confirms deletion before removing', async () => {
        const document = installPromptDom();
        const promptRepository = createPromptRepository([
            { id: 'p1', title: 'قديم', content: 'نص قديم' },
        ]);
        const onSaved = vi.fn();
        const manager = createPromptManager(document, { promptRepository, onSaved });

        manager.bind();
        manager.render(await promptRepository.list());
        document.querySelector<HTMLButtonElement>('.btn-edit-prompt')?.click();
        await vi.waitFor(() =>
            expect((document.getElementById('promptTitle') as HTMLInputElement).value).toBe('قديم')
        );

        (document.getElementById('promptTitle') as HTMLInputElement).value = 'محدّث';
        (document.getElementById('promptContent') as HTMLTextAreaElement).value = 'نص محدّث';
        document.getElementById('confirmSavePrompt')?.click();
        await vi.waitFor(() =>
            expect(promptRepository.save).toHaveBeenCalledWith({
                id: 'p1',
                title: 'محدّث',
                content: 'نص محدّث',
            })
        );

        vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
        document.querySelector<HTMLButtonElement>('.btn-delete-prompt')?.click();
        expect(promptRepository.remove).not.toHaveBeenCalled();

        vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
        document.querySelector<HTMLButtonElement>('.btn-delete-prompt')?.click();
        await vi.waitFor(() => expect(promptRepository.remove).toHaveBeenCalledWith('p1'));
        expect(onSaved).toHaveBeenCalledTimes(2);
    });

    it('keeps the modal open and reports storage failures while saving prompts', async () => {
        const document = installPromptDom();
        const promptRepository = createPromptRepository();
        promptRepository.save.mockRejectedValueOnce(new Error('quota exceeded'));
        const manager = createPromptManager(document, { promptRepository });

        manager.bind();
        document.getElementById('addPromptBtn')?.click();
        (document.getElementById('promptTitle') as HTMLInputElement).value = 'عنوان';
        (document.getElementById('promptContent') as HTMLTextAreaElement).value = 'نص';
        document.getElementById('confirmSavePrompt')?.click();

        await vi.waitFor(() =>
            expect(document.getElementById('promptModalStatus')?.textContent).toBe(
                'تعذر حفظ الأمر. تحقق من مساحة التخزين وحاول مجدداً.'
            )
        );
        expect(document.getElementById('promptModal')?.hidden).toBe(false);
    });

    it('clears validation messages on input and closes the modal with Escape or backdrop click', () => {
        const document = installPromptDom();
        const manager = createPromptManager(document, {
            promptRepository: createPromptRepository(),
        });
        const addButton = document.getElementById('addPromptBtn') as HTMLButtonElement;
        const addButtonFocus = vi.spyOn(addButton, 'focus');

        manager.bind();
        Object.defineProperty(document, 'activeElement', {
            configurable: true,
            value: addButton,
        });
        addButton.click();
        document.getElementById('confirmSavePrompt')?.click();

        expect(document.getElementById('promptTitleError')?.hidden).toBe(false);
        expect(document.getElementById('promptContentError')?.hidden).toBe(false);

        document.getElementById('promptTitle')?.dispatchEvent(new Event('input'));
        document.getElementById('promptContent')?.dispatchEvent(new Event('input'));
        expect(document.getElementById('promptTitleError')?.hidden).toBe(true);
        expect(document.getElementById('promptContentError')?.hidden).toBe(true);

        const escape = keyboardEvent('Escape');
        document.dispatchEvent(escape);
        expect(escape.defaultPrevented).toBe(true);
        expect(document.getElementById('promptModal')?.hidden).toBe(true);
        expect(document.querySelector('.dashboard-container')?.getAttribute('aria-hidden')).toBe(
            'false'
        );
        expect(addButtonFocus).toHaveBeenCalled();

        document.getElementById('addPromptBtn')?.click();
        document
            .getElementById('promptModal')
            ?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(document.getElementById('promptModal')?.hidden).toBe(true);
    });

    it('keeps keyboard focus inside the modal while tabbing', () => {
        const document = installPromptDom();
        const manager = createPromptManager(document, {
            promptRepository: createPromptRepository(),
        });
        const modalPanel = document.querySelector<HTMLElement>('.modal-panel');
        const promptId = document.getElementById('promptId') as HTMLInputElement;
        const saveButton = document.getElementById('confirmSavePrompt') as HTMLButtonElement;
        const promptIdFocus = vi.spyOn(promptId, 'focus');
        const saveButtonFocus = vi.spyOn(saveButton, 'focus');

        Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
            configurable: true,
            get() {
                return document.body;
            },
        });

        manager.bind();
        document.getElementById('addPromptBtn')?.click();

        Object.defineProperty(document, 'activeElement', {
            configurable: true,
            value: saveButton,
        });
        const tabFromLast = keyboardEvent('Tab');
        document.dispatchEvent(tabFromLast);
        expect(tabFromLast.defaultPrevented).toBe(true);
        expect(promptIdFocus).toHaveBeenCalled();

        Object.defineProperty(document, 'activeElement', {
            configurable: true,
            value: promptId,
        });
        const shiftTabFromFirst = keyboardEvent('Tab', true);
        document.dispatchEvent(shiftTabFromFirst);
        expect(shiftTabFromFirst.defaultPrevented).toBe(true);
        expect(saveButtonFocus).toHaveBeenCalled();

        Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
            configurable: true,
            get() {
                return null;
            },
        });
        const panelFocus = vi.spyOn(modalPanel ?? HTMLElement.prototype, 'focus');
        const tabWithNoFocusableElements = keyboardEvent('Tab');
        document.dispatchEvent(tabWithNoFocusableElements);

        expect(tabWithNoFocusableElements.defaultPrevented).toBe(true);
        expect(panelFocus).toHaveBeenCalled();
    });

    it('ignores stale edit and delete indexes after the prompt list changes', async () => {
        const document = installPromptDom();
        const promptRepository = createPromptRepository([
            { id: 'p1', title: 'قديم', content: 'نص قديم' },
        ]);
        const manager = createPromptManager(document, { promptRepository });

        manager.bind();
        manager.render(await promptRepository.list());
        promptRepository.list.mockResolvedValueOnce([]);

        document.querySelector<HTMLButtonElement>('.btn-edit-prompt')?.click();
        await vi.waitFor(() => expect(promptRepository.list).toHaveBeenCalledTimes(2));
        expect(document.getElementById('promptModal')?.hidden).toBe(true);

        vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
        promptRepository.list.mockResolvedValueOnce([]);
        document.querySelector<HTMLButtonElement>('.btn-delete-prompt')?.click();
        await vi.waitFor(() => expect(promptRepository.list).toHaveBeenCalledTimes(3));
        expect(promptRepository.remove).not.toHaveBeenCalled();
    });
});
