import { describe, expect, it, vi } from 'vitest';

import { nafezlyAdapter } from '../../../../src/platforms/nafezly/adapter';
import type {
    PlatformContentServices,
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
            list: vi.fn(async () => []),
            save: vi.fn(async (draft) => ({
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

describe('Nafezly platform adapter', () => {
    it('reports the extension context as valid under the fake browser runtime', () => {
        expect(nafezlyAdapter.isContextValid()).toBe(true);
    });

    it('matches project pages and other pages deterministically', () => {
        expect(
            nafezlyAdapter.matchPage({
                url: new URL('https://nafezly.com/project/555-dashboard'),
                document: installTestDom(),
            })
        ).toEqual({
            kind: 'project',
            key: 'project:555',
            projectId: '555',
        });
        expect(
            nafezlyAdapter.matchPage({
                url: new URL('https://nafezly.com/freelancers'),
                document: installTestDom(),
            })
        ).toEqual({
            kind: 'other',
            key: '/freelancers',
        });
    });

    it('rejects unrelated drafts and logged-out sessions before autofill', async () => {
        installBrowserDomShims();

        await expect(
            nafezlyAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document: installTestDom('<meta name="is_auth" content="1" /><form></form>'),
                draft: {
                    platformId: 'nafezly',
                    projectId: '2',
                    proposal: 'Unrelated proposal',
                    amount: 300,
                    durationDays: 4,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toMatchObject({
            kind: 'not-available',
            reason: expect.stringContaining('does not belong'),
        });

        await expect(
            nafezlyAdapter.applyProposalAutofill({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document: installTestDom('<form><textarea name="details"></textarea></form>'),
                draft: {
                    platformId: 'nafezly',
                    projectId: '1',
                    proposal: 'Logged out proposal',
                    amount: 300,
                    durationDays: 4,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toMatchObject({
            kind: 'not-available',
            reason: expect.stringContaining('logged-in session'),
        });
    });

    it('retries until the offer textarea exists, then fills text, amount, and duration', async () => {
        installBrowserDomShims();
        const page = { kind: 'project', key: 'project:1', projectId: '1' } as const;

        await expect(
            nafezlyAdapter.applyProposalAutofill({
                page,
                document: installTestDom('<meta name="is_auth" content="1" /><form></form>'),
                draft: {
                    platformId: 'nafezly',
                    projectId: '1',
                    proposal: 'Proposal text',
                    amount: 300,
                    durationDays: 4,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toMatchObject({
            kind: 'retry',
            reason: expect.stringContaining('textarea'),
        });

        const document = installTestDom(`
            <meta name="is_auth" content="1" />
            <form id="offer-form">
                <textarea name="details"></textarea>
                <input name="price" />
                <input name="duration" />
            </form>
        `);

        await expect(
            nafezlyAdapter.applyProposalAutofill({
                page,
                document,
                draft: {
                    platformId: 'nafezly',
                    projectId: '1',
                    proposal: 'Proposal text',
                    amount: 300,
                    durationDays: 4,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toEqual({ kind: 'applied' });

        const textarea = document.querySelector('textarea');
        const amount = document.querySelector<HTMLInputElement>('input[name="price"]');
        const duration = document.querySelector<HTMLInputElement>('input[name="duration"]');

        expect(textarea?.value).toBe('Proposal text');
        expect(amount?.value).toBe('300');
        expect(duration?.value).toBe('4');
        expect(textarea?.classList.contains('rasid-nafezly-autofilled')).toBe(true);
    });

    it('defers project panel mounting until a project offer section is present', () => {
        const contribution = nafezlyAdapter.ui[0];
        const services = createServices();

        expect(
            contribution?.mount({
                page: { kind: 'other', key: '/projects' },
                document: installTestDom(),
                services,
            })
        ).toEqual({ kind: 'deferred' });

        expect(
            contribution?.mount({
                page: { kind: 'project', key: 'project:7', projectId: '7' },
                document: installTestDom('<main></main>'),
                services,
            })
        ).toEqual({ kind: 'deferred' });

        const document = installTestDom('<section id="add-offer"></section>');
        const result = contribution?.mount({
            page: { kind: 'project', key: 'project:7', projectId: '7' },
            document,
            services,
        });

        expect(result?.kind).toBe('mounted');
        expect(document.getElementById('rasid-nafezly-panel')).toBeInstanceOf(HTMLElement);

        if (result?.kind === 'mounted') {
            result.dispose?.();
        }

        expect(document.getElementById('rasid-nafezly-panel')).toBeNull();
    });
});
