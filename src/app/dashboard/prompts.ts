import type { PromptTemplate } from '../../entities/prompt/model';
import type { PromptRepository } from '../../features/proposals/prompt-repository';

interface PromptManagerOptions {
    readonly onSaved?: () => void;
    readonly promptRepository: Pick<PromptRepository, 'list' | 'save' | 'remove'>;
}

export function createPromptManager(root: Document, options: PromptManagerOptions) {
    const list = root.getElementById('promptsList');
    const modal = root.getElementById('promptModal');
    const modalPanel = modal?.querySelector<HTMLElement>('.modal-panel') ?? null;
    const modalTitle = root.getElementById('modalTitle');
    const modalStatus = root.getElementById('promptModalStatus');
    const promptIdField = root.getElementById('promptId');
    const titleField = root.getElementById('promptTitle');
    const titleError = root.getElementById('promptTitleError');
    const contentField = root.getElementById('promptContent');
    const contentError = root.getElementById('promptContentError');
    const dashboardContainer = root.querySelector<HTMLElement>('.dashboard-container');
    let isBound = false;
    let lastFocusedElement: HTMLElement | null = null;

    const FOCUSABLE_SELECTOR = [
        'button:not([disabled])',
        'input:not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    function createPromptEmptyState(): HTMLParagraphElement {
        const paragraph = root.createElement('p');

        paragraph.className = 'help-text empty-state';
        paragraph.textContent = 'لا يوجد أوامر مضافة حالياً.';

        return paragraph;
    }

    function createIconButton(
        prompt: PromptTemplate,
        index: number,
        buttonClassName: string,
        iconClassName: string,
        actionLabel: string
    ): HTMLButtonElement {
        const button = root.createElement('button');
        const icon = root.createElement('i');
        const label = `${actionLabel}: ${prompt.title}`;

        button.dataset.index = String(index);
        button.className = `btn-icon ${buttonClassName}${
            buttonClassName.includes('delete') ? ' danger' : ''
        }`;
        button.type = 'button';
        button.setAttribute('aria-label', label);
        button.title = label;

        icon.className = iconClassName;
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);

        return button;
    }

    function createPromptCard(prompt: PromptTemplate, index: number): HTMLDivElement {
        const card = root.createElement('div');
        card.className = 'prompt-card';

        const header = root.createElement('div');
        header.className = 'prompt-card-header';

        const title = root.createElement('h4');
        title.className = 'prompt-card-title';
        title.textContent = prompt.title;

        const actions = root.createElement('div');
        actions.className = 'prompt-card-actions';
        actions.append(
            createIconButton(prompt, index, 'btn-edit-prompt', 'fas fa-edit', 'تعديل الأمر'),
            createIconButton(prompt, index, 'btn-delete-prompt', 'fas fa-trash', 'حذف الأمر')
        );

        header.append(title, actions);

        const content = root.createElement('p');
        content.className = 'prompt-card-content';
        content.textContent = prompt.content;

        card.append(header, content);

        return card;
    }

    function setBackgroundInert(isInert: boolean) {
        if (!dashboardContainer) {
            return;
        }

        const inertContainer = dashboardContainer as HTMLElement & { inert?: boolean };

        inertContainer.inert = isInert;
        dashboardContainer.setAttribute('aria-hidden', String(isInert));
    }

    function getFocusableModalElements(): HTMLElement[] {
        if (!(modal instanceof HTMLElement)) {
            return [];
        }

        return Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            (element) =>
                !element.hasAttribute('disabled') &&
                element.getAttribute('aria-hidden') !== 'true' &&
                element.offsetParent !== null
        );
    }

    function clearFieldError(field: HTMLElement | null, errorElement: Element | null) {
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
            field.setCustomValidity('');
        }

        field?.removeAttribute('aria-invalid');

        if (errorElement instanceof HTMLElement) {
            errorElement.textContent = '';
            errorElement.hidden = true;
        }
    }

    function setFieldError(
        field: HTMLInputElement | HTMLTextAreaElement,
        errorElement: Element | null,
        message: string
    ) {
        field.setCustomValidity(message);
        field.setAttribute('aria-invalid', 'true');

        if (errorElement instanceof HTMLElement) {
            errorElement.textContent = message;
            errorElement.hidden = false;
        }
    }

    function clearModalValidation() {
        clearFieldError(titleField instanceof HTMLElement ? titleField : null, titleError);
        clearFieldError(contentField instanceof HTMLElement ? contentField : null, contentError);

        if (modalStatus instanceof HTMLElement) {
            modalStatus.textContent = '';
            modalStatus.hidden = true;
        }
    }

    function showModalStatus(message: string) {
        if (!(modalStatus instanceof HTMLElement)) {
            return;
        }

        modalStatus.textContent = message;
        modalStatus.hidden = false;
    }

    function focusInitialModalField() {
        if (titleField instanceof HTMLInputElement) {
            titleField.focus();
            titleField.select();
            return;
        }

        modalPanel?.focus();
    }

    function closeModal() {
        if (!(modal instanceof HTMLElement)) {
            return;
        }

        modal.classList.add('hidden');
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        setBackgroundInert(false);
        clearModalValidation();

        if (lastFocusedElement?.isConnected) {
            lastFocusedElement.focus();
        }

        lastFocusedElement = null;
    }

    function openModal(prompt: PromptTemplate | null = null, index = -1) {
        if (
            !(modal instanceof HTMLElement) ||
            !(modalTitle instanceof HTMLElement) ||
            !(promptIdField instanceof HTMLInputElement) ||
            !(titleField instanceof HTMLInputElement) ||
            !(contentField instanceof HTMLTextAreaElement)
        ) {
            return;
        }

        lastFocusedElement = root.activeElement instanceof HTMLElement ? root.activeElement : null;
        clearModalValidation();

        if (prompt) {
            modalTitle.textContent = 'تعديل الأمر';
            titleField.value = prompt.title;
            contentField.value = prompt.content;
            promptIdField.value = String(index);
        } else {
            modalTitle.textContent = 'إضافة أمر جديد';
            titleField.value = '';
            contentField.value = '';
            promptIdField.value = '-1';
        }

        modal.classList.remove('hidden');
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        focusInitialModalField();
        setBackgroundInert(true);
    }

    async function editPrompt(index: number) {
        const prompts = await options.promptRepository.list();
        const prompt = prompts[index];

        if (prompt) {
            openModal(prompt, index);
        }
    }

    async function deletePrompt(index: number) {
        if (!window.confirm('هل أنت متأكد من حذف هذا الأمر؟')) {
            return;
        }

        const prompts = await options.promptRepository.list();
        const prompt = prompts[index];

        if (!prompt) {
            return;
        }

        const nextPrompts = await options.promptRepository.remove(prompt.id);
        render(nextPrompts);
        options.onSaved?.();
    }

    async function saveFromModal() {
        if (
            !(promptIdField instanceof HTMLInputElement) ||
            !(titleField instanceof HTMLInputElement) ||
            !(contentField instanceof HTMLTextAreaElement)
        ) {
            return;
        }

        const title = titleField.value.trim();
        const content = contentField.value.trim();
        const index = Number.parseInt(promptIdField.value, 10);

        clearModalValidation();

        if (!title) {
            setFieldError(titleField, titleError, 'يرجى إدخال عنوان الأمر.');
        }

        if (!content) {
            setFieldError(contentField, contentError, 'يرجى إدخال نص الأمر.');
        }

        if (!title || !content) {
            showModalStatus('راجع الحقول المطلوبة قبل حفظ الأمر.');
            (title ? contentField : titleField).reportValidity();
            return;
        }

        const prompts = await options.promptRepository.list();
        const existingPrompt = index >= 0 ? prompts[index] : null;

        if (index >= 0 && !existingPrompt) {
            return;
        }

        try {
            await options.promptRepository.save({
                id: existingPrompt?.id,
                title,
                content,
            });

            closeModal();
            render(await options.promptRepository.list());
            options.onSaved?.();
        } catch (error) {
            console.error('Error saving prompt:', error);
            showModalStatus('تعذر حفظ الأمر. تحقق من مساحة التخزين وحاول مجدداً.');
        }
    }

    function handleModalKeydown(event: KeyboardEvent) {
        if (!(modal instanceof HTMLElement) || modal.hidden) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            closeModal();
            return;
        }

        if (event.key !== 'Tab') {
            return;
        }

        const focusableElements = getFocusableModalElements();

        if (focusableElements.length === 0) {
            event.preventDefault();
            modalPanel?.focus();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = root.activeElement instanceof HTMLElement ? root.activeElement : null;

        if (event.shiftKey && activeElement === firstElement) {
            event.preventDefault();
            lastElement?.focus();
            return;
        }

        if (!event.shiftKey && activeElement === lastElement) {
            event.preventDefault();
            firstElement?.focus();
        }
    }

    function render(prompts: PromptTemplate[]) {
        if (!(list instanceof HTMLElement)) {
            return;
        }

        if (prompts.length === 0) {
            list.replaceChildren(createPromptEmptyState());
            return;
        }

        list.replaceChildren(...prompts.map((prompt, index) => createPromptCard(prompt, index)));
    }

    function bind() {
        if (isBound) {
            return;
        }

        isBound = true;

        root.getElementById('addPromptBtn')?.addEventListener('click', () => {
            openModal();
        });

        root.getElementById('closeModalBtn')?.addEventListener('click', () => {
            closeModal();
        });

        root.getElementById('confirmSavePrompt')?.addEventListener('click', () => {
            void saveFromModal();
        });

        list?.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null;
            const editButton = target?.closest<HTMLButtonElement>('.btn-edit-prompt');
            const deleteButton = target?.closest<HTMLButtonElement>('.btn-delete-prompt');

            if (editButton) {
                void editPrompt(Number.parseInt(editButton.dataset.index ?? '-1', 10));
                return;
            }

            if (deleteButton) {
                void deletePrompt(Number.parseInt(deleteButton.dataset.index ?? '-1', 10));
            }
        });

        modal?.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });

        titleField?.addEventListener('input', () => {
            clearFieldError(titleField instanceof HTMLElement ? titleField : null, titleError);
        });

        contentField?.addEventListener('input', () => {
            clearFieldError(
                contentField instanceof HTMLElement ? contentField : null,
                contentError
            );
        });

        root.addEventListener('keydown', handleModalKeydown);
    }

    return {
        bind,
        render,
    };
}
