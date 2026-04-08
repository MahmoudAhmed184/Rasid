import { AI_PROMPT_VARIABLES } from '../../../application/proposals/prompt-variables';
import type { PromptTemplate } from '../../../models/prompts';
import type { PlatformContentServices } from '../../contracts';
import { isContextValid } from './runtime';

// ==========================================
// mostaql/prompts.js — Prompt template CRUD
// ==========================================

const availableVariableText = AI_PROMPT_VARIABLES.map((key) => `{${key}}`).join(', ');

interface PromptDraft {
    id?: string;
    title: string;
    content: string;
}

type PromptServices = PlatformContentServices['prompts'];
type PromptListCallback = (prompts: readonly PromptTemplate[]) => void;
type PromptSavedCallback = (savedId: string) => void;

export function loadPrompts(services: PromptServices, callback: PromptListCallback): void {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
    (async () => {
        callback(await services.list());
    })().catch((error) => {
        console.error('Error loading prompts:', error);
    });
}

export function savePrompt(
    services: PromptServices,
    promptData: PromptDraft,
    callback?: PromptSavedCallback
): void {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
    (async () => {
        const savedPrompt = await services.save({
            id: promptData.id,
            title: promptData.title,
            content: promptData.content,
        });

        if (callback) {
            callback(savedPrompt.id);
        }
    })().catch((error) => {
        console.error('Error saving prompt:', error);
    });
}

export function createPromptModal(
    services: PromptServices,
    onSave?: PromptSavedCallback,
    existingPrompt: PromptTemplate | null = null
): void {
    if (document.getElementById('mostaql-prompt-modal')) {
        return;
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'mostaql-prompt-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'mostaql-modal-content';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'mostaql-form-group';

    const titleLabel = document.createElement('label');
    titleLabel.className = 'mostaql-form-label';
    titleLabel.textContent = 'عنوان القالب:';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'mostaql-form-input';
    if (existingPrompt) {
        titleInput.value = existingPrompt.title;
    }

    groupTitle.appendChild(titleLabel);
    groupTitle.appendChild(titleInput);

    const groupContent = document.createElement('div');
    groupContent.className = 'mostaql-form-group';

    const contentLabel = document.createElement('label');
    contentLabel.className = 'mostaql-form-label';
    contentLabel.textContent = 'محتوى القالب:';

    const contentHelp = document.createElement('div');
    contentHelp.className = 'mostaql-form-help';
    contentHelp.textContent = `المتغيرات المتاحة: ${availableVariableText}`;

    const contentInput = document.createElement('textarea');
    contentInput.className = 'mostaql-form-textarea';
    contentInput.rows = 6;
    if (existingPrompt) {
        contentInput.value = existingPrompt.content;
    }

    groupContent.appendChild(contentLabel);
    groupContent.appendChild(contentInput);
    groupContent.appendChild(contentHelp);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'mostaql-modal-actions';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = existingPrompt ? 'حفظ التعديلات' : 'حفظ القالب';
    saveBtn.className = 'btn-modal-primary';
    saveBtn.onclick = () => {
        const t = titleInput.value.trim();
        const c = contentInput.value.trim();
        if (t && c) {
            saveBtn.textContent = 'جاري الحفظ...';
            saveBtn.disabled = true;

            const promptData: PromptDraft = { title: t, content: c };
            if (existingPrompt) {
                promptData.id = existingPrompt.id;
            }

            savePrompt(services, promptData, (savedId) => {
                document.body.removeChild(modalOverlay);
                if (onSave) {
                    onSave(savedId);
                }
            });
        } else {
            alert('يرجى ملء جميع الحقول');
        }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'إلغاء';
    cancelBtn.className = 'btn-modal-secondary';
    cancelBtn.onclick = () => {
        document.body.removeChild(modalOverlay);
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);

    modalContent.appendChild(groupTitle);
    modalContent.appendChild(groupContent);
    modalContent.appendChild(btnContainer);

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
}
