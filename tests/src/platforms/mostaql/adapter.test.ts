import { describe, expect, it, vi } from 'vitest';

import { mostaqlAdapter } from '../../../../src/platforms/mostaql/adapter';
import type {
    PlatformContentServices,
    PlatformPromptDraft,
    ProposalGenerationResult,
} from '../../../../src/platforms/contracts';
import { installTestDom } from '../../../support/html';

function installScrollShim(): void {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
    });
}

function installMostaqlGlobals(href = 'https://mostaql.com/project/123-title'): void {
    const location = new URL(href);

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
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
        configurable: true,
        get(this: HTMLElement) {
            return this.textContent ?? '';
        },
        set(this: HTMLElement, value: string) {
            this.textContent = value;
        },
    });
}

function createServices(): PlatformContentServices {
    return {
        prompts: {
            list: vi.fn(async () => [
                {
                    id: 'default_proposal',
                    title: 'Default',
                    content: 'Prompt',
                },
            ]),
            save: vi.fn(async (draft: PlatformPromptDraft) => ({
                id: draft.id ?? 'saved',
                title: draft.title,
                content: draft.content,
            })),
        },
        tracking: {
            list: vi.fn(async () => []),
            isTracked: vi.fn(async () => false),
            toggle: vi.fn(async () => 'tracked' as const),
        },
        proposals: {
            getQuickTemplate: vi.fn(async () => ''),
            generate: vi.fn(
                async () =>
                    ({
                        kind: 'direct',
                        provider: 'openai',
                        model: 'gpt-test',
                        proposal: 'Generated proposal',
                    }) satisfies ProposalGenerationResult
            ),
            queueAutofill: vi.fn(async () => undefined),
            setPendingBridgePrompt: vi.fn(async () => undefined),
        },
        downloads: {
            downloadZip: vi.fn(async () => undefined),
        },
        toast: vi.fn(),
    };
}

describe('Mostaql platform adapter', () => {
    it('reports the extension context as valid under the fake browser runtime', () => {
        expect(mostaqlAdapter.isContextValid()).toBe(true);
    });

    it.each([
        [
            'project',
            'https://mostaql.com/project/123-title',
            { kind: 'project', key: 'project:123', projectId: '123' },
        ],
        [
            'message',
            'https://mostaql.com/message/thread-9',
            { kind: 'message', key: 'message:thread-9', threadId: 'thread-9' },
        ],
        [
            'profile',
            'https://mostaql.com/profile/user',
            { kind: 'profile', key: 'profile:/profile/user', profileId: null },
        ],
        ['home', 'https://mostaql.com/', { kind: 'home', key: 'home' }],
        ['other', 'https://mostaql.com/projects', { kind: 'other', key: '/projects' }],
    ])('matches %s pages', (_kind, href, expected) => {
        expect(
            mostaqlAdapter.matchPage({
                url: new URL(href),
                document: installTestDom(),
            })
        ).toEqual(expected);
    });

    it('retries incomplete proposal forms and applies matching autofill drafts', async () => {
        installScrollShim();

        await expect(
            mostaqlAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document: installTestDom('<main></main>'),
                draft: {
                    platformId: 'mostaql',
                    projectId: '1',
                    proposal: 'Proposal',
                    amount: 100,
                    durationDays: 3,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toMatchObject({
            kind: 'retry',
            reason: expect.stringContaining('amount and duration'),
        });

        const document = installTestDom(`
            <form id="add-proposal-form">
                <input name="cost" />
                <input name="period" />
                <textarea id="bid__details"></textarea>
            </form>
        `);
        installScrollShim();

        await expect(
            mostaqlAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document,
                draft: {
                    platformId: 'mostaql',
                    projectId: '2',
                    proposal: 'Wrong',
                    amount: 100,
                    durationDays: 3,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toMatchObject({
            kind: 'not-available',
        });

        await expect(
            mostaqlAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document,
                draft: {
                    platformId: 'mostaql',
                    projectId: '1',
                    proposal: 'عرض مستقل',
                    amount: 100,
                    durationDays: 3,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toEqual({ kind: 'applied' });

        expect(document.querySelector<HTMLInputElement>('input[name="cost"]')?.value).toBe('100');
        expect(document.querySelector<HTMLInputElement>('input[name="period"]')?.value).toBe('3');
        expect(document.querySelector<HTMLTextAreaElement>('#bid__details')?.value).toBe(
            'عرض مستقل'
        );
        expect(
            document.querySelector('#bid__details')?.classList.contains('mostaql-autofilled')
        ).toBe(true);
    });

    it('retries when only the proposal textarea is missing and applies minimal numeric drafts', async () => {
        installScrollShim();
        const document = installTestDom(`
            <form id="add-proposal-form">
                <input name="cost" />
                <input name="period" />
            </form>
        `);

        await expect(
            mostaqlAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document,
                draft: {
                    platformId: 'mostaql',
                    projectId: '1',
                    proposal: 'نص عرض بدون حقل جاهز',
                    amount: 100,
                    durationDays: 2,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toEqual({
            kind: 'retry',
            reason: 'Proposal text area is not ready yet.',
        });
        expect(document.querySelector<HTMLInputElement>('input[name="cost"]')?.value).toBe('100');
        expect(document.querySelector<HTMLInputElement>('input[name="period"]')?.value).toBe('2');

        await expect(
            mostaqlAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document,
                draft: {
                    platformId: 'mostaql',
                    projectId: '1',
                    proposal: '',
                    amount: 0,
                    durationDays: 0,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toEqual({ kind: 'applied' });
    });

    it('extracts proposal source context from a project page fixture', () => {
        const document = installTestDom(`
            <section id="project-meta-panel">
                <div class="meta-row"><span class="meta-label">التواصلات</span><span class="meta-value">2</span></div>
                <div class="meta-row"><span class="meta-label">مدة التنفيذ</span><span class="meta-value">6 أيام</span></div>
                <div class="meta-row"><span class="meta-label">الميزانية</span><span class="meta-value">$300 - $700</span></div>
            </section>
            <div data-type="project-budget_range">$300 - $700</div>
            <div class="profile__name"><bdi>عميل مستقل</bdi></div>
            <span class="breadcrumb-item" data-index="2">برمجة</span>
            <div class="skills"><span class="tag">TypeScript</span><span class="tag">WXT</span></div>
            <h1 class="heada__title"><span data-type="page-header-title">مشروع راصد</span></h1>
            <section id="projectDetailsTab">
                <div class="carda__content">وصف مشروع راصد لاختبار مصدر العرض.</div>
            </section>
        `);
        installMostaqlGlobals();

        const source = mostaqlAdapter.extractProposalSource({
            page: { kind: 'project', key: 'project:123', projectId: '123' },
            document,
            url: new URL('https://mostaql.com/project/123-title'),
        });

        expect(source).toMatchObject({
            minBudget: 300,
            durationDays: 6,
            trackedProject: {
                id: '123',
                platformId: 'mostaql',
                title: 'مشروع راصد',
                budget: '$300 - $700',
                duration: '6 أيام',
                clientName: 'عميل مستقل',
            },
            aiContext: {
                title: 'مشروع راصد',
                description: 'وصف مشروع راصد لاختبار مصدر العرض.',
                tags: 'TypeScript, WXT',
                projectId: '123',
                communications: '2',
            },
        });
    });

    it('returns no proposal source when a project id cannot be resolved', () => {
        const document = installTestDom(`
            <h1 class="heada__title"><span data-type="page-header-title">مشروع بلا رقم</span></h1>
            <section id="projectDetailsTab"><div class="carda__content">وصف موجود</div></section>
        `);
        installMostaqlGlobals('https://mostaql.com/projects');

        expect(
            mostaqlAdapter.extractProposalSource({
                page: { kind: 'project', key: 'project:', projectId: '' },
                document,
                url: new URL('https://mostaql.com/projects'),
            })
        ).toBeNull();
    });

    it('uses document-title fallbacks and alternate autofill selectors', async () => {
        installScrollShim();
        const document = installTestDom(`
            <div data-type="project-budget_range">USD 75 - 150</div>
            <section id="projectDetailsTab"><div class="carda__content">Fallback description</div></section>
            <div id="detached-fields">
                <input name="amount" />
                <input name="duration" />
                <textarea name="description"></textarea>
            </div>
        `);
        document.title = 'Document fallback title';
        installMostaqlGlobals('https://mostaql.com/projects/456-fallback');

        expect(
            mostaqlAdapter.extractProposalSource({
                page: { kind: 'project', key: 'project:456', projectId: '' },
                document,
                url: new URL('https://mostaql.com/projects/456-fallback'),
            })
        ).toMatchObject({
            minBudget: 75,
            durationDays: 0,
            trackedProject: {
                id: '456',
                title: 'Document fallback title',
                url: 'https://mostaql.com/projects/456-fallback',
            },
            aiContext: {
                title: 'Document fallback title',
                description: 'Fallback description',
                projectId: '456',
            },
        });

        await expect(
            mostaqlAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:456', projectId: '456' },
                document,
                draft: {
                    platformId: 'mostaql',
                    projectId: '456',
                    proposal: 'نص عبر محدد بديل',
                    amount: 75,
                    durationDays: 0,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toEqual({ kind: 'applied' });
        expect(document.querySelector<HTMLInputElement>('input[name="amount"]')?.value).toBe('75');
        expect(document.querySelector<HTMLInputElement>('input[name="duration"]')?.value).toBe('');
        expect(
            document.querySelector<HTMLTextAreaElement>('textarea[name="description"]')?.value
        ).toBe('نص عبر محدد بديل');
    });

    it('mounts and defers UI contributions based on public page markers', () => {
        const services = createServices();
        const [projectUi, messageUi, homeUi, profileUi] = mostaqlAdapter.ui;

        expect(
            projectUi?.mount({
                page: { kind: 'project', key: 'project:123', projectId: '123' },
                document: installTestDom('<main></main>'),
                services,
            })
        ).toEqual({ kind: 'deferred' });

        const projectDocument = installTestDom(`
            <section id="project-meta-panel"></section>
            <section id="projectDetailsTab"><div class="carda__content">وصف</div></section>
            <h1 class="heada__title"><span data-type="page-header-title">مشروع</span></h1>
        `);
        installMostaqlGlobals();
        const projectResult = projectUi?.mount({
            page: { kind: 'project', key: 'project:123', projectId: '123' },
            document: projectDocument,
            services,
        });
        expect(projectResult?.kind).toBe('mounted');
        expect(projectDocument.getElementById('track-project-btn')).toBeInstanceOf(
            HTMLButtonElement
        );
        expect(projectDocument.getElementById('mostaql-export-project-btn')).toBeInstanceOf(
            HTMLButtonElement
        );
        if (projectResult?.kind === 'mounted') {
            projectResult.dispose?.();
        }
        expect(projectDocument.getElementById('mostaql-ext-btn-container')).toBeNull();

        expect(
            messageUi?.mount({
                page: { kind: 'message', key: 'message:thread-1', threadId: 'thread-1' },
                document: installTestDom('<main></main>'),
                services,
            })
        ).toEqual({ kind: 'deferred' });

        const messageDocument = installTestDom('<aside id="message-meta"></aside>');
        expect(
            messageUi?.mount({
                page: { kind: 'message', key: 'message:thread-1', threadId: 'thread-1' },
                document: messageDocument,
                services,
            })
        ).toMatchObject({ kind: 'mounted' });
        expect(messageDocument.getElementById('mostaql-export-chat-btn')).toBeInstanceOf(
            HTMLButtonElement
        );

        expect(
            homeUi?.mount({
                page: { kind: 'home', key: 'home' },
                document: installTestDom('<main></main>'),
                services,
            })
        ).toEqual({ kind: 'deferred' });

        const homeDocument = installTestDom(`
            <section id="project-states">
                <a href="https://mostaql.com/dashboard/bids?status=processing">Processing</a>
                <div class="progress__bar"><span class="label-prj-completed">Done</span></div>
            </section>
        `);
        installMostaqlGlobals('https://mostaql.com/');
        const homeResult = homeUi?.mount({
            page: { kind: 'home', key: 'home' },
            document: homeDocument,
            services,
        });
        expect(homeResult?.kind).toBe('mounted');
        expect(homeDocument.getElementById('mostaql-msg-tools')).toBeInstanceOf(HTMLElement);
        expect(
            homeDocument.querySelector<HTMLAnchorElement>(
                'a[href="https://mostaql.com/dashboard/bids?status=processing"]'
            )
        ).toBeNull();
        expect(homeDocument.querySelector('.progress__bar')).toBeNull();
        if (homeResult?.kind === 'mounted') {
            homeResult.dispose?.();
        }
        expect(homeDocument.getElementById('mostaql-msg-tools')).toBeNull();

        const profileDocument = installTestDom('<aside class="profile_card"></aside>');
        expect(
            profileUi?.mount({
                page: { kind: 'profile', key: 'profile:/profile/u', profileId: null },
                document: profileDocument,
                services,
            })
        ).toMatchObject({ kind: 'mounted' });
        expect(profileDocument.getElementById('mostaql-profile-tools')).toBeInstanceOf(HTMLElement);
    });
});
