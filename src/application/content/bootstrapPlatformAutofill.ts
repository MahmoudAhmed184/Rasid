import type { ProposalRepository } from '../../infrastructure/storage/repositories/proposal-repository';
import type { PlatformAdapter, PlatformPage } from '../../platforms/contracts';

const DEFAULT_AUTOFILL_POLL_INTERVAL_MS = 500;
const DEFAULT_AUTOFILL_MAX_AGE_MS = 5 * 60 * 1000;

interface BootstrapPlatformAutofillOptions {
    readonly adapter: PlatformAdapter;
    readonly proposalRepository: Pick<
        ProposalRepository,
        'getQueuedAutofill' | 'clearQueuedAutofill'
    >;
    readonly document?: Document;
    readonly pollIntervalMs?: number;
    readonly maxDraftAgeMs?: number;
}

function getCurrentProjectPage(
    adapter: PlatformAdapter,
    doc: Document
): Extract<PlatformPage, { readonly kind: 'project' }> | null {
    const page = adapter.matchPage({
        url: new URL(doc.defaultView?.location.href ?? globalThis.location.href),
        document: doc,
    });

    return page.kind === 'project' ? page : null;
}

export function bootstrapPlatformAutofill(options: BootstrapPlatformAutofillOptions): void {
    const doc = options.document ?? document;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_AUTOFILL_POLL_INTERVAL_MS;
    const maxDraftAgeMs = options.maxDraftAgeMs ?? DEFAULT_AUTOFILL_MAX_AGE_MS;

    let autofillInFlight = false;

    async function maybeApplyQueuedAutofill(): Promise<void> {
        if (autofillInFlight || !options.adapter.isContextValid()) {
            return;
        }

        const page = getCurrentProjectPage(options.adapter, doc);

        if (!page) {
            return;
        }

        autofillInFlight = true;

        try {
            const draft = await options.proposalRepository.getQueuedAutofill(options.adapter.id);

            if (!draft) {
                return;
            }

            if (Date.now() - draft.createdAt > maxDraftAgeMs) {
                await options.proposalRepository.clearQueuedAutofill(options.adapter.id);
                return;
            }

            if (draft.projectId !== page.projectId) {
                return;
            }

            const result = await options.adapter.applyProposalAutofill({
                page,
                document: doc,
                draft,
            });

            if (result.kind === 'applied') {
                await options.proposalRepository.clearQueuedAutofill(options.adapter.id);
            }
        } catch (error) {
            console.error('[platform-autofill]', error);
        } finally {
            autofillInFlight = false;
        }
    }

    function init(): void {
        void maybeApplyQueuedAutofill();

        window.setInterval(() => {
            void maybeApplyQueuedAutofill();
        }, pollIntervalMs);

        const observer = new MutationObserver(() => {
            void maybeApplyQueuedAutofill();
        });

        observer.observe(doc.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', init, { once: true });
        return;
    }

    init();
}
