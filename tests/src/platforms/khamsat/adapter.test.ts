import { describe, expect, it, vi } from 'vitest';

import { khamsatAdapter } from '../../../../src/platforms/khamsat/adapter';
import type {
    PlatformContentServices,
    PlatformPromptDraft,
    ProposalGenerationResult,
} from '../../../../src/platforms/contracts';
import { installTestDom } from '../../../support/html';

function installBrowserDomShims(): void {
    Object.defineProperty(globalThis, 'KeyboardEvent', {
        configurable: true,
        value: Event,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
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
            openBridgePrompt: vi.fn(async () => undefined),
        },
        downloads: {
            downloadZip: vi.fn(async () => undefined),
        },
        toast: vi.fn(),
    };
}

describe('Khamsat platform adapter', () => {
    it('reports the extension context as valid under the fake browser runtime', () => {
        expect(khamsatAdapter.isContextValid()).toBe(true);
    });

    it('matches request pages and other pages deterministically', () => {
        expect(
            khamsatAdapter.matchPage({
                url: new URL('https://khamsat.com/community/requests/777-service'),
                document: installTestDom(),
            })
        ).toEqual({
            kind: 'project',
            key: 'project:777',
            projectId: '777',
        });
        expect(
            khamsatAdapter.matchPage({
                url: new URL('https://khamsat.com/community'),
                document: installTestDom(),
            })
        ).toEqual({
            kind: 'other',
            key: '/community',
        });
    });

    it('applies proposal autofill only to the matching request page', async () => {
        const document = installTestDom('<form><textarea name="reply"></textarea></form>');
        installBrowserDomShims();

        await expect(
            khamsatAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document,
                draft: {
                    platformId: 'khamsat',
                    projectId: '2',
                    proposal: 'عرض غير مطابق',
                    amount: 5,
                    durationDays: 0,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toMatchObject({
            kind: 'not-available',
        });

        await expect(
            khamsatAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document,
                draft: {
                    platformId: 'khamsat',
                    projectId: '1',
                    proposal: 'عرض خمسات',
                    amount: 5,
                    durationDays: 0,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toEqual({ kind: 'applied' });

        const textarea = document.querySelector('textarea');
        expect(textarea?.value).toBe('عرض خمسات');
        expect(textarea?.classList.contains('rasid-autofilled')).toBe(true);
    });

    it('retries until the reply textarea exists and supports empty proposal drafts', async () => {
        installBrowserDomShims();

        await expect(
            khamsatAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document: installTestDom('<form></form>'),
                draft: {
                    platformId: 'khamsat',
                    projectId: '1',
                    proposal: 'عرض خمسات',
                    amount: 0,
                    durationDays: 0,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toEqual({
            kind: 'retry',
            reason: 'Reply textarea is not ready yet.',
        });

        const document = installTestDom('<form><textarea name="reply"></textarea></form>');

        await expect(
            khamsatAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document,
                draft: {
                    platformId: 'khamsat',
                    projectId: '1',
                    proposal: '',
                    amount: 0,
                    durationDays: 0,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toEqual({ kind: 'applied' });

        expect(document.querySelector('textarea')?.value).toBe('');
    });

    it('extracts proposal source data and sanitizes attachments', () => {
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const document = installTestDom(`
            <title>Fallback - خمسات</title>
            <nav class="breadcrumb">
                <a>الرئيسية</a><a>طلبات الخدمات</a><a>برمجة</a>
            </nav>
            <main>
                <h1>مطلوب بناء إضافة متصفح</h1>
                <article class="replace_urls">
                    هذا وصف تفصيلي طويل بما يكفي لاختبار استخلاص وصف طلب خدمة من خمسات بدون الاعتماد على صفحة حية.
                </article>
                <a href="/user/client">عميل خمسات</a>
                <time datetime="2026-05-22">منذ ساعة</time>
                <div class="attachments">
                    <a href="/uploads/spec.pdf">spec.pdf</a>
                    <a href="https://evil.example/malware.pdf">evil.pdf</a>
                    <a href="/uploads/spec.pdf">duplicate.pdf</a>
                    <a href="/uploads/readme.html">readme</a>
                </div>
            </main>
        `);
        Object.defineProperty(globalThis, 'HTMLTimeElement', {
            configurable: true,
            value: HTMLElement,
        });

        const source = khamsatAdapter.extractProposalSource({
            page: { kind: 'project', key: 'project:777', projectId: '777' },
            document,
            url: new URL('https://khamsat.com/community/requests/777-service'),
        });

        expect(source).toMatchObject({
            minBudget: 5,
            durationDays: 0,
            trackedProject: {
                id: '777',
                platformId: 'khamsat',
                title: 'مطلوب بناء إضافة متصفح',
                category: 'برمجة',
                clientName: 'عميل خمسات',
                publishDate: '2026-05-22',
                attachments: [
                    {
                        name: 'spec.pdf',
                        url: 'https://khamsat.com/uploads/spec.pdf',
                    },
                ],
            },
        });
        expect(source?.aiContext.description).toContain('وصف تفصيلي طويل');
    });

    it('defers non-project UI contributions and mounts the project panel on request pages', () => {
        const contribution = khamsatAdapter.ui[0];
        const services = createServices();

        expect(
            contribution?.mount({
                page: { kind: 'other', key: '/community' },
                document: installTestDom(),
                services,
            })
        ).toEqual({ kind: 'deferred' });

        const document = installTestDom('<main></main>');
        const result = contribution?.mount({
            page: { kind: 'project', key: 'project:777', projectId: '777' },
            document,
            services,
        });

        expect(result?.kind).toBe('mounted');
        expect(document.getElementById('rasid-khamsat-panel')).toBeInstanceOf(HTMLElement);

        if (result?.kind === 'mounted') {
            result.dispose?.();
        }

        expect(document.getElementById('rasid-khamsat-panel')).toBeNull();
    });
});
