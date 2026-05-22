import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountNafezlyProjectPanel } from '../../../../../src/platforms/nafezly/content/project-panel';
import type { AiRequestContext } from '../../../../../src/entities/ai/model';
import type { PlatformAutofillDraft } from '../../../../../src/entities/platform/model';
import type { PlatformPromptDraft } from '../../../../../src/platforms/contracts';
import type {
    PlatformContentServices,
    ProposalGenerationResult,
    TrackedProjectRecord,
} from '../../../../../src/platforms/contracts';
import { installTestDom } from '../../../../support/html';

const DEFAULT_PROMPTS = [
    {
        id: 'default_proposal',
        title: 'قالب افتراضي',
        content: 'اكتب عرضا مناسبا',
    },
    {
        id: 'follow_up',
        title: 'متابعة',
        content: 'اكتب رسالة متابعة',
    },
] as const;

interface ServiceOptions {
    readonly prompts?: typeof DEFAULT_PROMPTS | [];
    readonly tracked?: boolean;
    readonly toggleResult?: 'tracked' | 'untracked';
    readonly generation?: ProposalGenerationResult;
}

function installPanelDom(markup = createValidProjectMarkup()): Document {
    const document = installTestDom(markup);
    const selectValues = new WeakMap<HTMLSelectElement, string>();
    const location = {
        href: 'https://nafezly.com/project/44-dashboard',
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

    return document;
}

function createValidProjectMarkup(): string {
    return `
        <main>
            <section id="add-offer"></section>
            <meta name="nafezly-title" content="بناء لوحة متابعة عربية" />
            <section class="main-nafez-box-styles">
                <h3 class="mb-1">تفاصيل المشروع</h3>
                <h2 class="naskh">أحتاج إلى إضافة متصفح TypeScript لاختبار لوحة متابعة وفرز وتنبيهات.</h2>
            </section>
            <section class="main-nafez-box-styles">
                <h3 class="mb-1">بطاقة المشروع</h3>
                <a href="/u/client">عميل نفذلي</a>
                <div class="col-12 row"><div>الميزانية</div><div>$500 - $700</div></div>
                <div class="col-12 row"><div>المدة المتاحة</div><div>7 أيام</div></div>
                <div class="col-12 row"><div>تاريخ النشر</div><div>منذ ساعة</div></div>
                <div class="col-12 row"><div>حالة المشروع</div><div>مفتوح</div></div>
            </section>
            <a class="tag-class" href="/projects/skill/typescript">TypeScript</a>
            <a class="tag-class" href="/projects/skill/browser">Extensions</a>
        </main>
    `;
}

function createServices(options: ServiceOptions = {}) {
    const generation: ProposalGenerationResult = options.generation ?? {
        kind: 'direct',
        provider: 'openai',
        model: 'gpt-test',
        proposal: 'عرض نفذلي جاهز',
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
        toast,
    };
}

function getPanel(document: Document): HTMLElement {
    const panel = document.getElementById('rasid-nafezly-panel');

    if (!(panel instanceof HTMLElement)) {
        throw new Error('Expected Nafezly panel to be mounted.');
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
    const status = panel.querySelector<HTMLElement>('.rasid-nafezly-panel__status');

    if (!status) {
        throw new Error('Expected Nafezly panel status.');
    }

    return status;
}

describe('Nafezly project panel', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('loads prompts, toggles tracking, and queues a direct generated proposal', async () => {
        vi.setSystemTime(new Date('2026-05-22T14:00:00.000Z'));
        const document = installPanelDom();
        const mocks = createServices();
        const dispose = mountNafezlyProjectPanel({
            page: { kind: 'project', key: 'project:44', projectId: '44' },
            document,
            services: mocks.services,
        });
        const panel = getPanel(document);

        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('جاهز لتوليد عرض لهذا المشروع.');
        });
        expect(mocks.promptsList).toHaveBeenCalledOnce();
        expect(mocks.trackingIsTracked).toHaveBeenCalledWith('44', 'nafezly');

        getButton(panel, 'متابعة').click();
        await vi.waitFor(() => {
            expect(mocks.trackingToggle).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: '44',
                    platformId: 'nafezly',
                    title: 'بناء لوحة متابعة عربية',
                    budget: '$500 - $700',
                    duration: '7 أيام',
                    clientName: 'عميل نفذلي',
                })
            );
        });
        expect(getStatus(panel).dataset.tone).toBe('success');

        getButton(panel, 'ولّد العرض').click();
        await vi.waitFor(() => {
            expect(mocks.queueAutofill).toHaveBeenCalledWith(
                expect.objectContaining({
                    platformId: 'nafezly',
                    projectId: '44',
                    proposal: 'عرض نفذلي جاهز',
                    amount: 500,
                    durationDays: 7,
                })
            );
        });
        expect(mocks.generate).toHaveBeenCalledWith(
            'default_proposal',
            expect.objectContaining({
                title: 'بناء لوحة متابعة عربية',
                projectId: '44',
                tags: ['TypeScript', 'Extensions'],
            })
        );
        expect(getStatus(panel).textContent).toContain('تم تجهيز العرض');

        dispose();
        expect(document.getElementById('rasid-nafezly-panel')).toBeNull();
    });

    it('opens the ChatGPT bridge result without queueing local autofill', async () => {
        const document = installPanelDom();
        const mocks = createServices({
            generation: {
                kind: 'bridge',
                prompt: 'اكتب عرضا',
                chatUrl: 'https://chatgpt.com/',
            },
        });
        mountNafezlyProjectPanel({
            page: { kind: 'project', key: 'project:45', projectId: '45' },
            document,
            services: mocks.services,
        });
        const panel = getPanel(document);

        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('جاهز لتوليد عرض لهذا المشروع.');
        });

        getButton(panel, 'ولّد العرض').click();

        await vi.waitFor(() => {
            expect(mocks.setPendingBridgePrompt).toHaveBeenCalledWith(
                'اكتب عرضا',
                'https://chatgpt.com/'
            );
        });
        expect(window.open).toHaveBeenCalledWith('https://chatgpt.com/', 'rasid_ai_chat');
        expect(mocks.queueAutofill).not.toHaveBeenCalled();
        expect(getStatus(panel).dataset.tone).toBe('success');
    });

    it('surfaces tracking and generation failures while leaving the panel reusable', async () => {
        const document = installPanelDom();
        const mocks = createServices({
            tracked: true,
            toggleResult: 'untracked',
        });
        mountNafezlyProjectPanel({
            page: { kind: 'project', key: 'project:47', projectId: '47' },
            document,
            services: mocks.services,
        });
        const panel = getPanel(document);

        await vi.waitFor(() => {
            expect(getButton(panel, 'إلغاء المتابعة').dataset.tracked).toBe('true');
        });

        mocks.trackingToggle.mockRejectedValueOnce(new Error('tracking storage down'));
        getButton(panel, 'إلغاء المتابعة').click();
        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('tracking storage down');
        });
        expect(getStatus(panel).dataset.tone).toBe('error');
        expect(getButton(panel, 'إلغاء المتابعة').disabled).toBe(false);

        getButton(panel, 'إلغاء المتابعة').click();
        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toContain('تمت إزالة المشروع');
        });
        expect(getButton(panel, 'متابعة').dataset.tracked).toBe('false');

        mocks.generate
            .mockResolvedValueOnce({
                kind: 'error',
                message: 'provider rejected',
            } satisfies ProposalGenerationResult)
            .mockRejectedValueOnce(new Error('provider offline'));

        getButton(panel, 'ولّد العرض').click();
        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('provider rejected');
        });
        expect(getStatus(panel).dataset.tone).toBe('error');

        getButton(panel, 'ولّد العرض').click();
        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toBe('provider offline');
        });
        expect(mocks.queueAutofill).not.toHaveBeenCalled();
    });

    it('reports setup failures from prompt or tracking services', async () => {
        const document = installPanelDom();
        const mocks = createServices();
        mocks.trackingIsTracked.mockRejectedValueOnce(new Error('tracking unavailable'));
        mountNafezlyProjectPanel({
            page: { kind: 'project', key: 'project:48', projectId: '48' },
            document,
            services: mocks.services,
        });

        await vi.waitFor(() => {
            expect(getStatus(getPanel(document)).textContent).toBe('tracking unavailable');
        });
        expect(getStatus(getPanel(document)).dataset.tone).toBe('error');
    });

    it('reports empty prompt lists and malformed project pages without side effects', async () => {
        const document = installPanelDom(`
            <main>
                <section id="add-offer"></section>
                <section class="main-nafez-box-styles">
                    <h3 class="mb-1">تفاصيل المشروع</h3>
                </section>
            </main>
        `);
        const mocks = createServices({
            prompts: [],
        });
        mountNafezlyProjectPanel({
            page: { kind: 'project', key: 'project:46', projectId: '46' },
            document,
            services: mocks.services,
        });
        const panel = getPanel(document);

        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toContain('لا توجد قوالب محفوظة');
        });

        getButton(panel, 'متابعة').click();
        await vi.waitFor(() => {
            expect(getStatus(panel).textContent).toContain('تعذر استخراج بيانات المشروع');
        });
        expect(mocks.trackingToggle).not.toHaveBeenCalled();
        expect(mocks.generate).not.toHaveBeenCalled();
        expect(mocks.queueAutofill).not.toHaveBeenCalled();
    });
});
