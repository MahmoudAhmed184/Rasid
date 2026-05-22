import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountKhamsatProjectPanel } from '../../../../../src/platforms/khamsat/content/project-panel';
import type { AiRequestContext } from '../../../../../src/entities/ai/model';
import type { PlatformAutofillDraft } from '../../../../../src/entities/platform/model';
import type {
    PlatformContentServices,
    PlatformPromptDraft,
    ProposalGenerationResult,
    TrackedProjectRecord,
} from '../../../../../src/platforms/contracts';
import { installTestDom } from '../../../../support/html';

const DEFAULT_PROMPTS = [
    {
        id: 'default_proposal',
        title: 'قالب رد افتراضي',
        content: 'اكتب ردا مناسبا',
    },
    {
        id: 'short_reply',
        title: 'رد قصير',
        content: 'اكتب ردا قصيرا',
    },
] as const;

interface ServiceOptions {
    readonly prompts?: typeof DEFAULT_PROMPTS | [];
    readonly tracked?: boolean;
    readonly toggleResult?: 'tracked' | 'untracked';
    readonly generation?: ProposalGenerationResult;
}

function createValidRequestMarkup(): string {
    return `
        <main>
            <nav class="breadcrumb">
                <a>الرئيسية</a>
                <a>طلبات الخدمات</a>
                <a>برمجة وتطوير</a>
            </nav>
            <h1>مطلوب تطوير إضافة متصفح</h1>
            <article class="replace_urls">
                نحتاج إلى مستقل يطوّر إضافة متصفح باللغة العربية مع اختبارات تغطي التخزين والتنبيهات وتجربة المستخدم.
            </article>
            <a href="/user/client">عميل خمسات</a>
            <time datetime="2026-05-22">منذ ساعة</time>
        </main>
    `;
}

function installPanelDom(markup = createValidRequestMarkup()): Document {
    const document = installTestDom(markup);
    const selectValues = new WeakMap<HTMLSelectElement, string>();
    const location = {
        href: 'https://khamsat.com/community/requests/777-browser-extension',
    };

    Object.defineProperty(HTMLSelectElement.prototype, 'options', {
        configurable: true,
        get(this: HTMLSelectElement) {
            return this.querySelectorAll('option');
        },
    });
    Object.defineProperty(HTMLSelectElement.prototype, 'value', {
        configurable: true,
        get(this: HTMLSelectElement) {
            return (
                selectValues.get(this) ??
                this.querySelector<HTMLOptionElement>('option')?.getAttribute('value') ??
                ''
            );
        },
        set(this: HTMLSelectElement, value: string) {
            selectValues.set(this, value);
        },
    });
    Object.defineProperty(window, 'open', {
        configurable: true,
        value: vi.fn(),
    });
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(globalThis, 'HTMLTimeElement', {
        configurable: true,
        value: HTMLElement,
    });

    return document;
}

function createServices(options: ServiceOptions = {}) {
    const generation: ProposalGenerationResult = options.generation ?? {
        kind: 'direct',
        provider: 'openai',
        model: 'gpt-test',
        proposal: 'رد خمسات جاهز',
    };
    const promptsList = vi.fn(async () => options.prompts ?? DEFAULT_PROMPTS);
    const promptSave = vi.fn(async (draft: PlatformPromptDraft) => ({
        id: draft.id ?? 'saved',
        title: draft.title,
        content: draft.content,
    }));
    const trackingList = vi.fn(async () => []);
    const trackingIsTracked = vi.fn(async () => options.tracked ?? false);
    const trackingToggle = vi.fn(
        async (_project: TrackedProjectRecord) => options.toggleResult ?? 'tracked'
    );
    const getQuickTemplate = vi.fn(async () => '');
    const generate = vi.fn(async (_templateId: string, _context: AiRequestContext) => generation);
    const queueAutofill = vi.fn(async (_draft: PlatformAutofillDraft) => undefined);
    const setPendingBridgePrompt = vi.fn(async (_prompt: string, _chatUrl?: string) => undefined);
    const downloadZip = vi.fn(async () => undefined);
    const toast = vi.fn();
    const services: PlatformContentServices = {
        prompts: {
            list: promptsList,
            save: promptSave,
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
            setPendingBridgePrompt,
        },
        downloads: {
            downloadZip,
        },
        toast,
    };

    return {
        services,
        promptsList,
        trackingIsTracked,
        trackingToggle,
        generate,
        queueAutofill,
        setPendingBridgePrompt,
    };
}

function getPanel(document: Document): HTMLElement {
    const panel = document.getElementById('rasid-khamsat-panel');

    if (!(panel instanceof HTMLElement)) {
        throw new Error('Expected Khamsat panel to be mounted.');
    }

    return panel;
}

function getButton(panel: HTMLElement, label: string): HTMLButtonElement {
    const button = [...panel.querySelectorAll('button')].find((candidate) =>
        candidate.textContent?.includes(label)
    );

    if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Expected button with label "${label}".`);
    }

    return button;
}

function getStatus(panel: HTMLElement): HTMLElement {
    const status = panel.querySelector<HTMLElement>('.rasid-khamsat-panel__status');

    if (!status) {
        throw new Error('Expected Khamsat panel status.');
    }

    return status;
}

describe('Khamsat project panel', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('loads prompts, toggles tracking, and queues a direct generated reply', async () => {
        vi.setSystemTime(new Date('2026-05-22T14:00:00.000Z'));
        const document = installPanelDom();
        const mocks = createServices();
        const dispose = mountKhamsatProjectPanel({
            page: { kind: 'project', key: 'project:777', projectId: '777' },
            document,
            services: mocks.services,
        });
        const panel = getPanel(document);

        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('جاهز لتوليد الرد لهذا الطلب.');
        });
        expect(mocks.promptsList).toHaveBeenCalledOnce();
        expect(mocks.trackingIsTracked).toHaveBeenCalledWith('777', 'khamsat');

        getButton(panel, 'متابعة').click();
        await vi.waitFor(() => {
            expect(mocks.trackingToggle).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: '777',
                    platformId: 'khamsat',
                    title: 'مطلوب تطوير إضافة متصفح',
                    category: 'برمجة وتطوير',
                    clientName: 'عميل خمسات',
                })
            );
        });
        expect(getStatus(panel).dataset.tone).toBe('success');

        getButton(panel, 'ولّد الرد').click();
        await vi.waitFor(() => {
            expect(mocks.queueAutofill).toHaveBeenCalledWith(
                expect.objectContaining({
                    platformId: 'khamsat',
                    projectId: '777',
                    proposal: 'رد خمسات جاهز',
                    amount: 5,
                    durationDays: 0,
                })
            );
        });
        expect(mocks.generate).toHaveBeenCalledWith(
            'default_proposal',
            expect.objectContaining({
                title: 'مطلوب تطوير إضافة متصفح',
                projectId: '777',
                category: 'برمجة وتطوير',
            })
        );
        expect(getStatus(panel).textContent).toContain('تم تجهيز الرد');

        dispose();
        expect(document.getElementById('rasid-khamsat-panel')).toBeNull();
    });

    it('opens bridge prompts for ChatGPT without queueing a local reply', async () => {
        const document = installPanelDom();
        const mocks = createServices({
            generation: {
                kind: 'bridge',
                prompt: 'اكتب رد خمسات',
                chatUrl: 'https://chat.openai.com/',
            },
        });
        mountKhamsatProjectPanel({
            page: { kind: 'project', key: 'project:778', projectId: '778' },
            document,
            services: mocks.services,
        });
        const panel = getPanel(document);

        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('جاهز لتوليد الرد لهذا الطلب.');
        });

        getButton(panel, 'ولّد الرد').click();

        await vi.waitFor(() => {
            expect(mocks.setPendingBridgePrompt).toHaveBeenCalledWith(
                'اكتب رد خمسات',
                'https://chat.openai.com/'
            );
        });
        expect(window.open).toHaveBeenCalledWith('https://chat.openai.com/', 'rasid_ai_chat');
        expect(mocks.queueAutofill).not.toHaveBeenCalled();
    });

    it('surfaces tracking and generation failures while preserving panel controls', async () => {
        const document = installPanelDom();
        const mocks = createServices({
            tracked: true,
            toggleResult: 'untracked',
        });
        mountKhamsatProjectPanel({
            page: { kind: 'project', key: 'project:780', projectId: '780' },
            document,
            services: mocks.services,
        });
        const panel = getPanel(document);

        await vi.waitFor(() => {
            expect(getButton(panel, 'إلغاء المتابعة').dataset.tracked).toBe('true');
        });

        mocks.trackingToggle.mockRejectedValueOnce(new Error('storage unavailable'));
        getButton(panel, 'إلغاء المتابعة').click();
        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('storage unavailable');
        });
        expect(getStatus(panel).dataset.tone).toBe('error');
        expect(getButton(panel, 'إلغاء المتابعة').disabled).toBe(false);

        getButton(panel, 'إلغاء المتابعة').click();
        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toContain('تمت إزالة الطلب');
        });
        expect(getButton(panel, 'متابعة').dataset.tracked).toBe('false');

        mocks.generate
            .mockResolvedValueOnce({
                kind: 'error',
                message: 'provider rejected',
            } satisfies ProposalGenerationResult)
            .mockRejectedValueOnce(new Error('provider offline'));

        getButton(panel, 'ولّد الرد').click();
        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('provider rejected');
        });
        expect(getStatus(panel).dataset.tone).toBe('error');

        getButton(panel, 'ولّد الرد').click();
        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('provider offline');
        });
        expect(mocks.queueAutofill).not.toHaveBeenCalled();
    });

    it('reports setup failures from prompt or tracking services', async () => {
        const document = installPanelDom();
        const mocks = createServices();
        mocks.promptsList.mockRejectedValueOnce(new Error('prompt storage down'));
        mountKhamsatProjectPanel({
            page: { kind: 'project', key: 'project:781', projectId: '781' },
            document,
            services: mocks.services,
        });

        await vi.waitFor(() => {
            expect(getStatus(getPanel(document)).textContent).toBe('prompt storage down');
        });
        expect(getStatus(getPanel(document)).dataset.tone).toBe('error');
    });

    it('reports missing prompts and malformed request pages without mutating state', async () => {
        const document = installPanelDom('<main><h1></h1><article></article></main>');
        const mocks = createServices({
            prompts: [],
        });
        mountKhamsatProjectPanel({
            page: { kind: 'project', key: 'project:779', projectId: '779' },
            document,
            services: mocks.services,
        });
        const panel = getPanel(document);

        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toContain('لا توجد قوالب محفوظة');
        });

        getButton(panel, 'متابعة').click();

        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toContain('تعذر استخراج بيانات الطلب');
        });
        expect(mocks.trackingToggle).not.toHaveBeenCalled();
        expect(mocks.generate).not.toHaveBeenCalled();
        expect(mocks.queueAutofill).not.toHaveBeenCalled();
    });
});
