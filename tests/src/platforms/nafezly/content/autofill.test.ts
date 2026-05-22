import { describe, expect, it, vi } from 'vitest';

import { applyNafezlyProposalAutofill } from '../../../../../src/platforms/nafezly/content/autofill';
import { installTestDom } from '../../../../support/html';

function installAutofillShims(): void {
    Object.defineProperty(globalThis, 'KeyboardEvent', {
        configurable: true,
        value: Event,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
    });
}

describe('Nafezly proposal autofill', () => {
    it('rejects mismatched projects and unauthenticated pages', async () => {
        const document = installTestDom('<meta name="is_auth" content="0" />');

        await expect(
            applyNafezlyProposalAutofill({
                page: { kind: 'project', key: 'project:10', projectId: '10' },
                document,
                draft: {
                    platformId: 'nafezly',
                    projectId: '11',
                    proposal: 'Proposal',
                    amount: 100,
                    durationDays: 3,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toMatchObject({
            kind: 'not-available',
            reason: expect.stringContaining('does not belong'),
        });

        await expect(
            applyNafezlyProposalAutofill({
                page: { kind: 'project', key: 'project:10', projectId: '10' },
                document,
                draft: {
                    platformId: 'nafezly',
                    projectId: '10',
                    proposal: 'Proposal',
                    amount: 100,
                    durationDays: 3,
                    createdAt: Date.now(),
                },
            })
        ).resolves.toMatchObject({
            kind: 'not-available',
            reason: expect.stringContaining('logged-in'),
        });
    });

    it('retries until the offer form is ready and then fills proposal, amount, and duration', async () => {
        installAutofillShims();
        const missingFormDocument = installTestDom('<meta name="is_auth" content="1" />');
        const draft = {
            platformId: 'nafezly' as const,
            projectId: '10',
            proposal: 'عرض نفذلي',
            amount: 450,
            durationDays: 6,
            createdAt: Date.now(),
        };

        await expect(
            applyNafezlyProposalAutofill({
                page: { kind: 'project', key: 'project:10', projectId: '10' },
                document: missingFormDocument,
                draft,
            })
        ).resolves.toMatchObject({
            kind: 'retry',
        });

        const document = installTestDom(`
            <meta name="is_auth" content="1" />
            <form id="offer-form">
                <textarea name="details"></textarea>
                <input name="price" />
                <input name="duration" />
            </form>
        `);
        installAutofillShims();

        await expect(
            applyNafezlyProposalAutofill({
                page: { kind: 'project', key: 'project:10', projectId: '10' },
                document,
                draft,
            })
        ).resolves.toEqual({ kind: 'applied' });

        expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('عرض نفذلي');
        expect(document.querySelector<HTMLInputElement>('input[name="price"]')?.value).toBe('450');
        expect(document.querySelector<HTMLInputElement>('input[name="duration"]')?.value).toBe('6');
        expect(
            document.querySelector('textarea')?.classList.contains('rasid-nafezly-autofilled')
        ).toBe(true);
    });
});
