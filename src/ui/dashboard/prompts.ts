import type { PromptTemplate } from '../../models/prompts';
import type { PromptRepository } from '../../infrastructure/storage/repositories/prompt-repository';

interface PromptManagerOptions {
    readonly onSaved?: () => void;
    readonly promptRepository: Pick<PromptRepository, 'list' | 'save' | 'remove'>;
}

export function createPromptManager(root: Document, options: PromptManagerOptions) {
    const list = root.getElementById('promptsList');
    const modal = root.getElementById('promptModal');
    const modalTitle = root.getElementById('modalTitle');
    const promptIdField = root.getElementById('promptId');
    const titleField = root.getElementById('promptTitle');
    const contentField = root.getElementById('promptContent');
    let isBound = false;

    function createPromptEmptyState(): HTMLParagraphElement {
        const paragraph = root.createElement('p');

        paragraph.className = 'help-text';
        paragraph.style.gridColumn = '1/-1';
        paragraph.style.textAlign = 'center';
        paragraph.style.padding = '40px';
        paragraph.textContent = 'لا يوجد أوامر مضافة حالياً.';

        return paragraph;
    }

    function createIconButton(
        index: number,
        buttonClassName: string,
        iconClassName: string,
        color: string
    ): HTMLButtonElement {
        const button = root.createElement('button');
        const icon = root.createElement('i');

        button.dataset.index = String(index);
        button.className = `btn-icon ${buttonClassName}`;
        button.style.background = 'none';
        button.style.border = 'none';
        button.style.color = color;
        button.style.cursor = 'pointer';
        button.type = 'button';

        icon.className = iconClassName;
        button.appendChild(icon);

        return button;
    }

    function createPromptCard(prompt: PromptTemplate, index: number): HTMLDivElement {
        const card = root.createElement('div');
        card.className = 'prompt-card';

        const header = root.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'flex-start';
        header.style.marginBottom = '12px';

        const title = root.createElement('h4');
        title.style.fontWeight = '800';
        title.style.fontSize = '16px';
        title.style.color = 'var(--text-title)';
        title.textContent = prompt.title;

        const actions = root.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';
        actions.append(
            createIconButton(index, 'btn-edit-prompt', 'fas fa-edit', 'var(--text-muted)'),
            createIconButton(index, 'btn-delete-prompt', 'fas fa-trash', 'var(--danger)')
        );

        header.append(title, actions);

        const content = root.createElement('p');
        content.style.fontSize = '13px';
        content.style.color = 'var(--text-body)';
        content.style.display = '-webkit-box';
        content.style.setProperty('-webkit-line-clamp', '3');
        content.style.setProperty('-webkit-box-orient', 'vertical');
        content.style.overflow = 'hidden';
        content.textContent = prompt.content;

        card.append(header, content);

        return card;
    }

    function closeModal() {
        modal?.classList.add('hidden');
    }

    function openModal(prompt: PromptTemplate | null = null, index = -1) {
        if (
            !(modalTitle instanceof HTMLElement) ||
            !(promptIdField instanceof HTMLInputElement) ||
            !(titleField instanceof HTMLInputElement) ||
            !(contentField instanceof HTMLTextAreaElement)
        ) {
            return;
        }

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

        modal?.classList.remove('hidden');
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

        if (!title || !content) {
            window.alert('يرجى ملء جميع الحقول');
            return;
        }

        const prompts = await options.promptRepository.list();
        const existingPrompt = index >= 0 ? prompts[index] : null;

        if (index >= 0 && !existingPrompt) {
            return;
        }

        await options.promptRepository.save({
            id: existingPrompt?.id,
            title,
            content,
        });

        closeModal();
        render(await options.promptRepository.list());
        options.onSaved?.();
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
    }

    return {
        bind,
        render,
    };
}
