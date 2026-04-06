import { browser } from 'wxt/browser'

import type { PromptTemplate } from '../../models/extension'

interface PromptManagerOptions {
    onSaved?: () => void
}

export function createPromptManager(root: Document, options: PromptManagerOptions = {}) {
    const list = root.getElementById('promptsList')
    const modal = root.getElementById('promptModal')
    const modalTitle = root.getElementById('modalTitle')
    const promptIdField = root.getElementById('promptId')
    const titleField = root.getElementById('promptTitle')
    const contentField = root.getElementById('promptContent')
    let isBound = false

    function closeModal() {
        modal?.classList.add('hidden')
    }

    function openModal(prompt: PromptTemplate | null = null, index = -1) {
        if (
            !(modalTitle instanceof HTMLElement) ||
            !(promptIdField instanceof HTMLInputElement) ||
            !(titleField instanceof HTMLInputElement) ||
            !(contentField instanceof HTMLTextAreaElement)
        ) {
            return
        }

        if (prompt) {
            modalTitle.textContent = 'تعديل الأمر'
            titleField.value = prompt.title
            contentField.value = prompt.content
            promptIdField.value = String(index)
        } else {
            modalTitle.textContent = 'إضافة أمر جديد'
            titleField.value = ''
            contentField.value = ''
            promptIdField.value = '-1'
        }

        modal?.classList.remove('hidden')
    }

    async function editPrompt(index: number) {
        const data = (await browser.storage.local.get(['prompts'])) as { prompts?: PromptTemplate[] }
        const prompt = data.prompts?.[index]

        if (prompt) {
            openModal(prompt, index)
        }
    }

    async function deletePrompt(index: number) {
        if (!window.confirm('هل أنت متأكد من حذف هذا الأمر؟')) {
            return
        }

        const data = (await browser.storage.local.get(['prompts'])) as { prompts?: PromptTemplate[] }
        const prompts = Array.isArray(data.prompts) ? [...data.prompts] : []
        prompts.splice(index, 1)

        await browser.storage.local.set({ prompts })
        render(prompts)
        options.onSaved?.()
    }

    async function saveFromModal() {
        if (
            !(promptIdField instanceof HTMLInputElement) ||
            !(titleField instanceof HTMLInputElement) ||
            !(contentField instanceof HTMLTextAreaElement)
        ) {
            return
        }

        const title = titleField.value.trim()
        const content = contentField.value.trim()
        const index = Number.parseInt(promptIdField.value, 10)

        if (!title || !content) {
            window.alert('يرجى ملء جميع الحقول')
            return
        }

        const data = (await browser.storage.local.get(['prompts'])) as { prompts?: PromptTemplate[] }
        const prompts = Array.isArray(data.prompts) ? [...data.prompts] : []

        if (index >= 0) {
            prompts[index] = {
                ...prompts[index],
                title,
                content,
            }
        } else {
            prompts.push({
                id: crypto.randomUUID(),
                title,
                content,
            })
        }

        await browser.storage.local.set({ prompts })
        closeModal()
        render(prompts)
        options.onSaved?.()
    }

    function render(prompts: PromptTemplate[]) {
        if (!(list instanceof HTMLElement)) {
            return
        }

        if (prompts.length === 0) {
            list.innerHTML =
                '<p class="help-text" style="grid-column: 1/-1; text-align: center; padding: 40px;">لا يوجد أوامر مضافة حالياً.</p>'
            return
        }

        list.innerHTML = prompts
            .map(
                (prompt, index) => `
                    <div class="prompt-card">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <h4 style="font-weight: 800; font-size: 16px; color: var(--text-title);">${prompt.title}</h4>
                            <div style="display: flex; gap: 8px;">
                                <button data-index="${index}" class="btn-icon btn-edit-prompt" style="background: none; border: none; color: var(--text-muted); cursor: pointer;" type="button"><i class="fas fa-edit"></i></button>
                                <button data-index="${index}" class="btn-icon btn-delete-prompt" style="background: none; border: none; color: var(--danger); cursor: pointer;" type="button"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <p style="font-size: 13px; color: var(--text-body); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${prompt.content}</p>
                    </div>
                `
            )
            .join('')
    }

    function bind() {
        if (isBound) {
            return
        }

        isBound = true

        root.getElementById('addPromptBtn')?.addEventListener('click', () => {
            openModal()
        })

        root.getElementById('closeModalBtn')?.addEventListener('click', () => {
            closeModal()
        })

        root.getElementById('confirmSavePrompt')?.addEventListener('click', () => {
            void saveFromModal()
        })

        list?.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null
            const editButton = target?.closest<HTMLButtonElement>('.btn-edit-prompt')
            const deleteButton = target?.closest<HTMLButtonElement>('.btn-delete-prompt')

            if (editButton) {
                void editPrompt(Number.parseInt(editButton.dataset.index ?? '-1', 10))
                return
            }

            if (deleteButton) {
                void deletePrompt(Number.parseInt(deleteButton.dataset.index ?? '-1', 10))
            }
        })
    }

    return {
        bind,
        render,
    }
}
