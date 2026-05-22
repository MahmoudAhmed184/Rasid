import { describe, expect, it, vi } from 'vitest';

import { bootstrapPlatformAutofill } from '../../../../src/app/content/bootstrapPlatformAutofill';
import type { PlatformAdapter, PlatformAutofillDraft } from '../../../../src/platforms/contracts';
import { installTestDom } from '../../../support/html';

function installAutofillDom(url: string, readyState: DocumentReadyState = 'complete'): Document {
    const document = installTestDom('<main><form></form></main>');

    Object.defineProperty(document, 'readyState', {
        configurable: true,
        value: readyState,
    });
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL(url),
    });
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: new URL(url),
    });
    Object.defineProperty(globalThis, 'MutationObserver', {
        configurable: true,
        value: class {
            disconnect = vi.fn();
            observe = vi.fn();
        },
    });

    return document;
}

type TestPlatformAdapter = PlatformAdapter & {
    setContextValid(next: boolean): void;
};

function createAdapter(applyProposalAutofill = vi.fn()): TestPlatformAdapter {
    let contextValid = true;

    return {
        id: 'mostaql',
        displayName: 'Mostaql',
        matches: ['https://mostaql.com/*'],
        isContextValid: () => contextValid,
        setContextValid(next: boolean) {
            contextValid = next;
        },
        matchPage: ({ url }) => {
            const projectId = url.pathname.match(/\/project\/(\d+)/)?.[1];

            return projectId
                ? ({ kind: 'project', key: `project:${projectId}`, projectId } as const)
                : ({ kind: 'other', key: url.pathname } as const);
        },
        extractProposalSource: () => null,
        ui: [],
        applyProposalAutofill,
    } satisfies TestPlatformAdapter;
}

function createDraft(overrides: Partial<PlatformAutofillDraft> = {}): PlatformAutofillDraft {
    return {
        platformId: 'mostaql',
        projectId: '123',
        proposal: 'Proposal',
        amount: 500,
        durationDays: 5,
        createdAt: Date.now(),
        ...overrides,
    };
}

describe('platform autofill bootstrap', () => {
    it('applies matching queued drafts and clears them after successful autofill', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const document = installAutofillDom('https://mostaql.com/project/123');
        const applyProposalAutofill = vi.fn(async () => ({ kind: 'applied' as const }));
        const proposalRepository = {
            getQueuedAutofill: vi.fn(async () => createDraft()),
            clearQueuedAutofill: vi.fn(async () => undefined),
        };

        bootstrapPlatformAutofill({
            adapter: createAdapter(applyProposalAutofill),
            proposalRepository,
            document,
            pollIntervalMs: 25,
        });

        await vi.waitFor(() => expect(applyProposalAutofill).toHaveBeenCalledOnce());
        expect(applyProposalAutofill).toHaveBeenCalledWith(
            expect.objectContaining({
                page: { kind: 'project', key: 'project:123', projectId: '123' },
                draft: expect.objectContaining({ projectId: '123' }),
            })
        );
        expect(proposalRepository.clearQueuedAutofill).toHaveBeenCalledWith('mostaql');
    });

    it('clears stale drafts and leaves mismatched drafts queued', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const document = installAutofillDom('https://mostaql.com/project/123');
        const staleDraft = createDraft({
            createdAt: Date.now() - 10 * 60 * 1000,
        });
        const mismatchedDraft = createDraft({ projectId: '999' });
        const applyProposalAutofill = vi.fn(async () => ({ kind: 'applied' as const }));
        const proposalRepository = {
            getQueuedAutofill: vi
                .fn()
                .mockResolvedValueOnce(staleDraft)
                .mockResolvedValueOnce(mismatchedDraft),
            clearQueuedAutofill: vi.fn(async () => undefined),
        };

        bootstrapPlatformAutofill({
            adapter: createAdapter(applyProposalAutofill),
            proposalRepository,
            document,
            pollIntervalMs: 25,
            maxDraftAgeMs: 5 * 60 * 1000,
        });

        await vi.waitFor(() =>
            expect(proposalRepository.clearQueuedAutofill).toHaveBeenCalledOnce()
        );
        await vi.advanceTimersByTimeAsync(25);

        expect(applyProposalAutofill).not.toHaveBeenCalled();
        expect(proposalRepository.clearQueuedAutofill).toHaveBeenCalledTimes(1);
    });

    it('does not poll after disposal', async () => {
        vi.useFakeTimers();
        const document = installAutofillDom('https://mostaql.com/project/123');
        const proposalRepository = {
            getQueuedAutofill: vi.fn(async () => null),
            clearQueuedAutofill: vi.fn(async () => undefined),
        };

        const dispose = bootstrapPlatformAutofill({
            adapter: createAdapter(),
            proposalRepository,
            document,
            pollIntervalMs: 25,
        });

        await vi.waitFor(() => expect(proposalRepository.getQueuedAutofill).toHaveBeenCalledOnce());
        dispose();
        await vi.advanceTimersByTimeAsync(50);

        expect(proposalRepository.getQueuedAutofill).toHaveBeenCalledTimes(1);
    });

    it('skips invalid contexts, non-project pages, and missing drafts without applying', async () => {
        vi.useFakeTimers();
        const invalidDocument = installAutofillDom('https://mostaql.com/project/123');
        const invalidAdapter = createAdapter();
        invalidAdapter.setContextValid(false);
        const invalidRepository = {
            getQueuedAutofill: vi.fn(async () => createDraft()),
            clearQueuedAutofill: vi.fn(async () => undefined),
        };

        bootstrapPlatformAutofill({
            adapter: invalidAdapter,
            proposalRepository: invalidRepository,
            document: invalidDocument,
            pollIntervalMs: 25,
        });
        await vi.advanceTimersByTimeAsync(25);

        expect(invalidRepository.getQueuedAutofill).not.toHaveBeenCalled();

        const nonProjectDocument = installAutofillDom('https://mostaql.com/projects');
        const nonProjectRepository = {
            getQueuedAutofill: vi.fn(async () => createDraft()),
            clearQueuedAutofill: vi.fn(async () => undefined),
        };

        bootstrapPlatformAutofill({
            adapter: createAdapter(),
            proposalRepository: nonProjectRepository,
            document: nonProjectDocument,
            pollIntervalMs: 25,
        });
        await vi.advanceTimersByTimeAsync(25);

        expect(nonProjectRepository.getQueuedAutofill).not.toHaveBeenCalled();

        const noDraftDocument = installAutofillDom('https://mostaql.com/project/123');
        const applyProposalAutofill = vi.fn(async () => ({ kind: 'applied' as const }));
        const noDraftRepository = {
            getQueuedAutofill: vi.fn(async () => null),
            clearQueuedAutofill: vi.fn(async () => undefined),
        };

        bootstrapPlatformAutofill({
            adapter: createAdapter(applyProposalAutofill),
            proposalRepository: noDraftRepository,
            document: noDraftDocument,
            pollIntervalMs: 25,
        });

        await vi.waitFor(() => expect(noDraftRepository.getQueuedAutofill).toHaveBeenCalledOnce());
        expect(applyProposalAutofill).not.toHaveBeenCalled();
        expect(noDraftRepository.clearQueuedAutofill).not.toHaveBeenCalled();
    });

    it('leaves retry results queued and logs repository or autofill failures without stopping later polls', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        const document = installAutofillDom('https://mostaql.com/project/123');
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const applyProposalAutofill = vi
            .fn()
            .mockRejectedValueOnce(new Error('form missing'))
            .mockResolvedValueOnce({ kind: 'retry', reason: 'field missing' });
        const proposalRepository = {
            getQueuedAutofill: vi
                .fn()
                .mockRejectedValueOnce(new Error('storage unavailable'))
                .mockResolvedValue(createDraft()),
            clearQueuedAutofill: vi.fn(async () => undefined),
        };

        const dispose = bootstrapPlatformAutofill({
            adapter: createAdapter(applyProposalAutofill),
            proposalRepository,
            document,
            pollIntervalMs: 25,
        });

        await vi.waitFor(() =>
            expect(error).toHaveBeenCalledWith('[platform-autofill]', expect.any(Error))
        );
        await vi.advanceTimersByTimeAsync(25);
        await vi.waitFor(() =>
            expect(applyProposalAutofill.mock.calls.length).toBeGreaterThanOrEqual(1)
        );
        await vi.advanceTimersByTimeAsync(25);
        await vi.waitFor(() =>
            expect(applyProposalAutofill.mock.calls.length).toBeGreaterThanOrEqual(2)
        );

        dispose();
        expect(error.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(proposalRepository.clearQueuedAutofill).not.toHaveBeenCalled();
    });

    it('waits for DOMContentLoaded when loading and can dispose before initialization', async () => {
        vi.useFakeTimers();
        const disposedDocument = installAutofillDom('https://mostaql.com/project/123', 'loading');
        const disposedRepository = {
            getQueuedAutofill: vi.fn(async () => createDraft()),
            clearQueuedAutofill: vi.fn(async () => undefined),
        };

        const disposeBeforeReady = bootstrapPlatformAutofill({
            adapter: createAdapter(),
            proposalRepository: disposedRepository,
            document: disposedDocument,
            pollIntervalMs: 25,
        });
        disposeBeforeReady();
        disposedDocument.dispatchEvent(new Event('DOMContentLoaded'));
        await vi.advanceTimersByTimeAsync(25);

        expect(disposedRepository.getQueuedAutofill).not.toHaveBeenCalled();

        const readyDocument = installAutofillDom('https://mostaql.com/project/123', 'loading');
        const readyRepository = {
            getQueuedAutofill: vi.fn(async () => createDraft()),
            clearQueuedAutofill: vi.fn(async () => undefined),
        };
        const applyProposalAutofill = vi.fn(async () => ({ kind: 'applied' as const }));

        bootstrapPlatformAutofill({
            adapter: createAdapter(applyProposalAutofill),
            proposalRepository: readyRepository,
            document: readyDocument,
            pollIntervalMs: 1_000,
        });
        readyDocument.dispatchEvent(new Event('DOMContentLoaded'));

        await vi.waitFor(() => expect(applyProposalAutofill).toHaveBeenCalledOnce());
        readyDocument.defaultView?.dispatchEvent(new Event('unload'));
        await vi.advanceTimersByTimeAsync(25);
        expect(applyProposalAutofill).toHaveBeenCalledOnce();
    });
});
