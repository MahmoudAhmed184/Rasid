import { afterEach, describe, expect, it, vi } from 'vitest';

import { injectTrackButton } from '../../../../../src/platforms/mostaql/content/project-sidebar';
import type { AiRequestContext } from '../../../../../src/entities/ai/model';
import type { PlatformAutofillDraft } from '../../../../../src/entities/platform/model';
import type {
    PlatformContentServices,
    PlatformPromptDraft,
    ProposalGenerationResult,
    TrackedProjectRecord,
} from '../../../../../src/platforms/contracts';
import { installTestDom } from '../../../../support/html';

const PROMPTS = [
    {
        id: 'default_proposal',
        title: 'قالب افتراضي',
        content: 'اكتب عرضا',
    },
] as const;

function installProjectPage(markup = createProjectPageMarkup()): Document {
    const document = installTestDom(markup);
    const location = new URL('https://mostaql.com/project/321-browser-extension');

    Object.defineProperty(window, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(window, 'open', {
        configurable: true,
        value: vi.fn(),
    });
    Object.defineProperty(window, 'alert', {
        configurable: true,
        value: vi.fn(),
    });
    Object.defineProperty(globalThis, 'alert', {
        configurable: true,
        value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
        configurable: true,
        get(this: HTMLElement) {
            return this.textContent ?? '';
        },
        set(this: HTMLElement, value: string) {
            this.textContent = value;
        },
    });

    return document;
}

function createProjectPageMarkup(): string {
    return `
        <main>
            <section id="project-meta-panel">
                <div class="meta-row"><span class="meta-label">التواصلات</span><span class="meta-value">3</span></div>
                <div class="meta-row"><span class="meta-label">مدة التنفيذ</span><span class="meta-value">4 أيام</span></div>
                <div class="meta-row"><span class="meta-label">الميزانية</span><span class="meta-value">$150 - $300</span></div>
            </section>
            <div data-type="project-budget_range">$150 - $300</div>
            <div class="profile__name"><bdi>عميل مستقل</bdi></div>
            <span class="breadcrumb-item" data-index="2">برمجة</span>
            <div class="skills"><span class="tag">TypeScript</span></div>
            <h1 class="heada__title"><span data-type="page-header-title">مشروع إضافة متصفح</span></h1>
            <section id="projectDetailsTab">
                <div class="carda__content">وصف مشروع مستقل لاختبار أزرار راصد الجانبية.</div>
            </section>
        </main>
    `;
}

function createServices(options: { readonly generation?: ProposalGenerationResult } = {}) {
    const generation =
        options.generation ??
        ({
            kind: 'direct',
            provider: 'openai',
            model: 'gpt-test',
            proposal: 'عرض مولد',
        } satisfies ProposalGenerationResult);
    const promptsList = vi.fn(async () => PROMPTS);
    const promptsSave = vi.fn(async (draft: PlatformPromptDraft) => ({
        id: draft.id ?? 'saved',
        title: draft.title,
        content: draft.content,
    }));
    const trackingList = vi.fn(async () => []);
    const trackingIsTracked = vi.fn(async () => true);
    const trackingToggle = vi.fn(async (_project: TrackedProjectRecord) => 'untracked' as const);
    const getQuickTemplate = vi.fn(async () => 'عرض سريع');
    const generate = vi.fn(async (_templateId: string, _context: AiRequestContext) => generation);
    const queueAutofill = vi.fn(async (_draft: PlatformAutofillDraft) => undefined);
    const openBridgePrompt = vi.fn(async (_prompt: string, _chatUrl?: string) => undefined);
    const downloadZip = vi.fn(async () => undefined);
    const toast = vi.fn();
    const services: PlatformContentServices = {
        prompts: {
            list: promptsList,
            save: promptsSave,
        },
        tracking: {
            list: trackingList,
            isTracked: trackingIsTracked,
            toggle: trackingToggle,
        },
        proposals: {
            getQuickTemplate,
            generate,
            queueAutofill,
            openBridgePrompt,
        },
        downloads: {
            downloadZip,
        },
        toast,
    };

    return {
        services,
        promptsList,
        promptsSave,
        trackingIsTracked,
        trackingToggle,
        getQuickTemplate,
        generate,
        queueAutofill,
        openBridgePrompt,
    };
}

describe('Mostaql project sidebar injection', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('defers when the project meta panel is absent', () => {
        installProjectPage('<main></main>');

        expect(injectTrackButton(createServices().services)).toBeUndefined();
    });

    it('injects tracking, quick bid, and direct AI proposal actions', async () => {
        vi.setSystemTime(new Date('2026-05-22T17:00:00.000Z'));
        const document = installProjectPage();
        const mocks = createServices();
        const dispose = injectTrackButton(mocks.services);

        expect(dispose).toBeTypeOf('function');
        expect(document.getElementById('track-project-btn')).toBeInstanceOf(HTMLButtonElement);
        expect(document.getElementById('header-quick-bid-btn')).toBeInstanceOf(HTMLButtonElement);
        expect(document.getElementById('chatgpt-group')).toBeInstanceOf(HTMLElement);

        await vi.waitFor(() => {
            expect(mocks.trackingIsTracked).toHaveBeenCalledWith('321', 'mostaql');
            expect(document.getElementById('track-project-btn')?.textContent).toContain('مُراقبة');
            expect(mocks.promptsList).toHaveBeenCalled();
        });

        document.getElementById('track-project-btn')?.click();
        await vi.waitFor(() => {
            expect(mocks.trackingToggle).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: '321',
                    platformId: 'mostaql',
                    title: 'مشروع إضافة متصفح',
                    budget: '$150 - $300',
                    duration: '4 أيام',
                    clientName: 'عميل مستقل',
                })
            );
        });
        expect(document.getElementById('track-project-btn')?.textContent).toContain('مراقبة');

        document.getElementById('header-quick-bid-btn')?.click();
        await vi.waitFor(() => {
            expect(mocks.getQuickTemplate).toHaveBeenCalledOnce();
            expect(mocks.queueAutofill).toHaveBeenCalledWith(
                expect.objectContaining({
                    platformId: 'mostaql',
                    projectId: '321',
                    proposal: 'عرض سريع',
                    amount: 150,
                    durationDays: 4,
                    createdAt: new Date('2026-05-22T17:00:00.000Z').getTime(),
                })
            );
        });

        document.getElementById('chatgpt-main-btn')?.click();
        await vi.waitFor(() => {
            expect(mocks.generate).toHaveBeenCalledWith(
                'default_proposal',
                expect.objectContaining({
                    title: 'مشروع إضافة متصفح',
                    description: 'وصف مشروع مستقل لاختبار أزرار راصد الجانبية.',
                    projectId: '321',
                    budget: '$150 - $300',
                    duration: '4 أيام',
                })
            );
            expect(mocks.queueAutofill).toHaveBeenCalledWith(
                expect.objectContaining({
                    platformId: 'mostaql',
                    projectId: '321',
                    proposal: 'عرض مولد',
                    durationDays: 4,
                })
            );
        });

        dispose?.();
        expect(document.getElementById('mostaql-ext-btn-container')).toBeNull();
    });

    it('opens bridge prompts through the background ChatGPT handoff', async () => {
        const document = installProjectPage();
        const mocks = createServices({
            generation: {
                kind: 'bridge',
                prompt: 'اكتب عرضا',
                chatUrl: 'https://chatgpt.com/',
            },
        });
        injectTrackButton(mocks.services);

        await vi.waitFor(() => {
            expect(mocks.promptsList).toHaveBeenCalled();
        });

        document.getElementById('chatgpt-main-btn')?.click();

        await vi.waitFor(() => {
            expect(mocks.openBridgePrompt).toHaveBeenCalledWith(
                'اكتب عرضا',
                'https://chatgpt.com/'
            );
        });
        expect(window.open).not.toHaveBeenCalled();
    });

    it('alerts when project description is missing before AI generation', async () => {
        const document = installProjectPage(`
            <main>
                <section id="project-meta-panel"></section>
                <h1 class="heada__title"><span data-type="page-header-title">مشروع بلا وصف</span></h1>
            </main>
        `);
        const mocks = createServices();
        injectTrackButton(mocks.services);

        await vi.waitFor(() => {
            expect(mocks.promptsList).toHaveBeenCalled();
        });
        document.getElementById('chatgpt-main-btn')?.click();

        expect(window.alert).toHaveBeenCalledWith('لم يتم العثور على وصف المشروع.');
        expect(mocks.generate).not.toHaveBeenCalled();
    });

    it('reports missing prompt IDs and proposal-generation failures to the user', async () => {
        const document = installProjectPage();
        const mocks = createServices({
            generation: {
                kind: 'error',
                message: 'Provider rejected the request.',
            },
        });
        injectTrackButton(mocks.services);

        await vi.waitFor(() => {
            expect(mocks.promptsList).toHaveBeenCalled();
        });

        const mainButton = document.getElementById('chatgpt-main-btn') as HTMLButtonElement;
        mainButton.dataset.promptId = 'missing-template';
        mainButton.click();
        await vi.waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(
                'خطأ: لم يتم العثور على القالب المحدد (ID: missing-template). تحقق من قائمة الأوامر.'
            );
        });
        expect(mocks.generate).not.toHaveBeenCalled();

        mainButton.dataset.promptId = 'default_proposal';
        mainButton.click();
        await vi.waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(
                'خطأ: تعذر إنشاء العرض. Provider rejected the request.'
            );
        });
        expect(mocks.generate).toHaveBeenCalledOnce();
    });

    it('toggles and closes the prompt dropdown without leaking document listeners', async () => {
        const document = installProjectPage();
        const mocks = createServices();
        const dispose = injectTrackButton(mocks.services);

        await vi.waitFor(() => {
            expect(mocks.promptsList).toHaveBeenCalled();
        });

        const group = document.getElementById('chatgpt-group');
        const toggle = document.getElementById('chatgpt-dropdown-toggle');

        toggle?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(group?.classList.contains('open')).toBe(true);

        document.body.dispatchEvent(new Event('click', { bubbles: true }));
        expect(group?.classList.contains('open')).toBe(false);

        dispose?.();
        expect(document.getElementById('chatgpt-group')).toBeNull();
    });

    it('repairs stale containers and supports prompt menu selection, edit, and add flows', async () => {
        const document = installProjectPage(
            `<div id="mostaql-ext-btn-container">stale outside panel</div>${createProjectPageMarkup()}`
        );
        const mocks = createServices();
        injectTrackButton(mocks.services);

        await vi.waitFor(() => {
            expect(mocks.promptsList).toHaveBeenCalled();
        });

        const container = document.getElementById('mostaql-ext-btn-container');
        const metaPanel = document.getElementById('project-meta-panel');
        expect(container?.parentElement).toBe(metaPanel);
        expect(container?.textContent).not.toContain('stale outside panel');

        document
            .getElementById('chatgpt-dropdown-toggle')
            ?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(document.querySelector('#chatgpt-group .prompt-li.active')).toBeInstanceOf(
            HTMLElement
        );

        const menuPromptButton = document.querySelector<HTMLButtonElement>(
            '#chatgpt-group .prompt-li button'
        );
        menuPromptButton?.click();
        await vi.waitFor(() => {
            expect(mocks.generate).toHaveBeenCalledWith(
                'default_proposal',
                expect.objectContaining({ title: 'مشروع إضافة متصفح' })
            );
        });
        expect(document.getElementById('chatgpt-group')?.classList.contains('open')).toBe(false);

        document
            .getElementById('chatgpt-dropdown-toggle')
            ?.dispatchEvent(new Event('click', { bubbles: true }));
        document
            .querySelector<HTMLButtonElement>('#chatgpt-group button[title="تعديل القالب"]')
            ?.click();

        let modal = document.getElementById('mostaql-prompt-modal');
        expect(modal).toBeInstanceOf(HTMLElement);
        expect(modal?.querySelector<HTMLInputElement>('input')?.value).toBe('قالب افتراضي');
        expect(modal?.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('اكتب عرضا');
        [...(modal?.querySelectorAll('button') ?? [])]
            .find((button) => button.textContent?.includes('إلغاء'))
            ?.click();

        document
            .getElementById('chatgpt-dropdown-toggle')
            ?.dispatchEvent(new Event('click', { bubbles: true }));
        [...document.querySelectorAll<HTMLButtonElement>('#chatgpt-group .dropdown-menu button')]
            .find((button) => button.textContent?.includes('إضافة قالب جديد'))
            ?.click();

        modal = document.getElementById('mostaql-prompt-modal');
        const titleInput = modal?.querySelector<HTMLInputElement>('input');
        const contentInput = modal?.querySelector<HTMLTextAreaElement>('textarea');
        titleInput!.value = 'قالب متابعة';
        contentInput!.value = 'نص متابعة';
        [...(modal?.querySelectorAll('button') ?? [])]
            .find((button) => button.textContent?.includes('حفظ القالب'))
            ?.click();

        await vi.waitFor(() => {
            expect(mocks.promptsSave).toHaveBeenCalledWith({
                id: undefined,
                title: 'قالب متابعة',
                content: 'نص متابعة',
            });
            expect(document.getElementById('mostaql-prompt-modal')).toBeNull();
        });
    });
});
