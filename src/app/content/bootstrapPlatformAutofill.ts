import type { ProposalRepository } from '../../features/proposals/proposal-repository';
import type { PlatformAdapter, PlatformDisposer, PlatformPage } from '../../platforms/contracts';

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

export function bootstrapPlatformAutofill(
    options: BootstrapPlatformAutofillOptions
): PlatformDisposer {
    const doc = options.document ?? document;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_AUTOFILL_POLL_INTERVAL_MS;
    const maxDraftAgeMs = options.maxDraftAgeMs ?? DEFAULT_AUTOFILL_MAX_AGE_MS;

    const win = doc.defaultView ?? window;
    const requestFrame =
        typeof win?.requestAnimationFrame === 'function'
            ? win.requestAnimationFrame.bind(win)
            : (cb: () => void) => window.setTimeout(cb, 0);
    const cancelFrame =
        typeof win?.cancelAnimationFrame === 'function'
            ? win.cancelAnimationFrame.bind(win)
            : (id: number) => window.clearTimeout(id);

    let autofillInFlight = false;
    let initialized = false;
    let disposed = false;
    let autofillCompleted = false;
    let intervalId: number | null = null;
    let observer: MutationObserver | null = null;
    let scheduledFrameId: number | null = null;
    let observedTargets: readonly Element[] = [];

    function scheduleAutofillCheck(): void {
        if (disposed || autofillCompleted || scheduledFrameId !== null) {
            return;
        }

        scheduledFrameId = requestFrame(() => {
            scheduledFrameId = null;
            void maybeApplyQueuedAutofill();
        });
    }

    function disconnectObserver(): void {
        if (observer) {
            observer.disconnect();
            observedTargets = [];
        }
    }

    function resolveObservationTargets(page: PlatformPage): readonly Element[] {
        const adapterTargets = options.adapter.getObservationTargets?.({
            page,
            document: doc,
        });

        if (adapterTargets && adapterTargets.length > 0) {
            const connectedTargets = [...new Set(adapterTargets)].filter(
                (target) => target.isConnected ?? (doc.contains ? doc.contains(target) : true)
            );

            if (connectedTargets.length > 0) {
                return connectedTargets;
            }
        }

        return doc.documentElement ? [doc.documentElement] : [];
    }

    function syncObserverScope(page: PlatformPage | null): void {
        if (!observer || disposed || autofillCompleted) {
            return;
        }

        if (!page) {
            disconnectObserver();
            return;
        }

        const nextTargets = resolveObservationTargets(page);
        if (
            nextTargets.length === observedTargets.length &&
            nextTargets.every((target, index) => target === observedTargets[index])
        ) {
            return;
        }

        observer.disconnect();
        observedTargets = nextTargets;

        for (const target of observedTargets) {
            observer.observe(target, {
                childList: true,
                subtree: true,
            });
        }
    }

    async function maybeApplyQueuedAutofill(): Promise<void> {
        if (
            disposed ||
            autofillCompleted ||
            autofillInFlight ||
            !options.adapter.isContextValid()
        ) {
            return;
        }

        const page = getCurrentProjectPage(options.adapter, doc);

        if (!page) {
            syncObserverScope(null);
            return;
        }

        syncObserverScope(page);

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

            if (result?.kind === 'applied') {
                await options.proposalRepository.clearQueuedAutofill(options.adapter.id);
                autofillCompleted = true;
                disconnectObserver();
                if (intervalId !== null) {
                    window.clearInterval(intervalId);
                    intervalId = null;
                }
            }
        } catch (error) {
            console.error('[platform-autofill]', error);
        } finally {
            autofillInFlight = false;
        }
    }

    function init(): void {
        if (initialized || disposed) {
            return;
        }

        initialized = true;

        if (typeof MutationObserver === 'function') {
            observer = new MutationObserver(() => {
                scheduleAutofillCheck();
            });
        }

        void maybeApplyQueuedAutofill();

        intervalId = window.setInterval(() => {
            void maybeApplyQueuedAutofill();
        }, pollIntervalMs);

        doc.defaultView?.addEventListener('pagehide', dispose, { once: true });
    }

    function dispose(): void {
        if (disposed) {
            return;
        }

        disposed = true;
        doc.removeEventListener('DOMContentLoaded', init);
        doc.defaultView?.removeEventListener('pagehide', dispose);

        if (scheduledFrameId !== null) {
            cancelFrame(scheduledFrameId);
            scheduledFrameId = null;
        }

        if (intervalId !== null) {
            window.clearInterval(intervalId);
            intervalId = null;
        }

        disconnectObserver();
        observer = null;
    }

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', init, { once: true });
        return dispose;
    }

    init();
    return dispose;
}
