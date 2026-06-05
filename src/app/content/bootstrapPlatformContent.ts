import type {
    PlatformAdapter,
    PlatformContributionMountResult,
    PlatformContentServices,
    PlatformDisposer,
    PlatformPage,
} from '../../platforms/contracts';

const DEFAULT_ROUTE_POLL_INTERVAL_MS = 500;
const DEFAULT_OBSERVATION_DISCOVERY_WINDOW_MS = 12_000;
const DEFAULT_DEFERRED_RETRY_DELAYS_MS = [250, 750, 1_500, 3_000] as const;

interface BootstrapPlatformContentOptions {
    readonly adapter: PlatformAdapter;
    readonly document?: Document;
    readonly observationDiscoveryWindowMs?: number;
    readonly deferredRetryDelaysMs?: readonly number[];
    readonly routePollIntervalMs?: number;
    readonly services: PlatformContentServices;
}

function getCurrentPage(adapter: PlatformAdapter, doc: Document): PlatformPage {
    return adapter.matchPage({
        url: new URL(doc.defaultView?.location.href ?? globalThis.location.href),
        document: doc,
    });
}

export function bootstrapPlatformContent(options: BootstrapPlatformContentOptions): void {
    const doc = options.document ?? document;
    const routePollIntervalMs = options.routePollIntervalMs ?? DEFAULT_ROUTE_POLL_INTERVAL_MS;
    const observationDiscoveryWindowMs =
        options.observationDiscoveryWindowMs ?? DEFAULT_OBSERVATION_DISCOVERY_WINDOW_MS;
    const deferredRetryDelaysMs =
        options.deferredRetryDelaysMs ?? DEFAULT_DEFERRED_RETRY_DELAYS_MS;

    let activePageKey = '';
    let observerStarted = false;
    let scheduledFrameId: number | null = null;
    let deferredRetryTimeoutId: number | null = null;
    let deferredRetryIndex = 0;
    let mutationObserver: MutationObserver | null = null;
    let observedTargets: readonly Element[] = [];
    let fallbackDiscoveryDeadline = 0;
    let fallbackDiscoveryTimeoutId: number | null = null;
    const activeDisposers = new Map<string, PlatformDisposer>();
    const mountedContributionIds = new Set<string>();

    function disposeActiveMounts(): void {
        for (const dispose of activeDisposers.values()) {
            dispose();
        }

        activeDisposers.clear();
        mountedContributionIds.clear();
    }

    function clearDeferredRetry(): void {
        if (deferredRetryTimeoutId !== null) {
            window.clearTimeout(deferredRetryTimeoutId);
            deferredRetryTimeoutId = null;
        }

        deferredRetryIndex = 0;
    }

    function scheduleDeferredRetry(): void {
        if (deferredRetryTimeoutId !== null || deferredRetryIndex >= deferredRetryDelaysMs.length) {
            return;
        }

        const delayMs = deferredRetryDelaysMs[deferredRetryIndex] ?? 0;
        deferredRetryIndex += 1;
        deferredRetryTimeoutId = window.setTimeout(() => {
            deferredRetryTimeoutId = null;
            scheduleContributionRun();
        }, delayMs);
    }

    function resetObservationDiscoveryWindow(): void {
        fallbackDiscoveryDeadline = Date.now() + observationDiscoveryWindowMs;

        if (fallbackDiscoveryTimeoutId !== null) {
            window.clearTimeout(fallbackDiscoveryTimeoutId);
            fallbackDiscoveryTimeoutId = null;
        }
    }

    function clearObservationDiscoveryTimeout(): void {
        if (fallbackDiscoveryTimeoutId !== null) {
            window.clearTimeout(fallbackDiscoveryTimeoutId);
            fallbackDiscoveryTimeoutId = null;
        }
    }

    function scheduleFallbackDiscoveryStop(): void {
        if (fallbackDiscoveryTimeoutId !== null) {
            return;
        }

        const remainingMs = Math.max(0, fallbackDiscoveryDeadline - Date.now());
        fallbackDiscoveryTimeoutId = window.setTimeout(() => {
            fallbackDiscoveryTimeoutId = null;
            refreshObservationTargets(getCurrentPage(options.adapter, doc));
        }, remainingMs);
    }

    function scheduleContributionRun(): void {
        if (scheduledFrameId !== null) {
            return;
        }

        scheduledFrameId = window.requestAnimationFrame(() => {
            scheduledFrameId = null;
            runContributions();
        });
    }

    function runContributions(): void {
        if (!options.adapter.isContextValid()) {
            return;
        }

        const page = getCurrentPage(options.adapter, doc);
        const pageChanged = page.key !== activePageKey;

        if (pageChanged) {
            disposeActiveMounts();
            clearDeferredRetry();
            resetObservationDiscoveryWindow();
            activePageKey = page.key;
        }

        refreshObservationTargets(page);

        let hasDeferredContribution = false;

        for (const contribution of options.adapter.ui) {
            if (!contribution.pages.includes(page.kind)) {
                continue;
            }

            if (!pageChanged && mountedContributionIds.has(contribution.id)) {
                continue;
            }

            const mountResult: PlatformContributionMountResult = contribution.mount({
                page,
                document: doc,
                services: options.services,
            });

            if (mountResult.kind === 'deferred') {
                hasDeferredContribution = true;
                continue;
            }

            mountedContributionIds.add(contribution.id);

            if (mountResult.dispose) {
                activeDisposers.set(contribution.id, mountResult.dispose);
            } else {
                activeDisposers.delete(contribution.id);
            }
        }

        if (hasDeferredContribution) {
            scheduleDeferredRetry();
        } else {
            clearDeferredRetry();
        }
    }

    function resolveAdapterObservationTargets(page: PlatformPage): readonly Element[] {
        const targets = options.adapter.getObservationTargets?.({
            page,
            document: doc,
        });

        if (targets && targets.length > 0) {
            const connectedTargets = [...new Set(targets)].filter((target) => target.isConnected);

            if (connectedTargets.length > 0) {
                return connectedTargets;
            }
        }

        return [];
    }

    function resolveObservationTargets(page: PlatformPage): {
        readonly targets: readonly Element[];
        readonly usingFallback: boolean;
    } {
        const adapterTargets = resolveAdapterObservationTargets(page);

        if (adapterTargets.length > 0) {
            return {
                targets: adapterTargets,
                usingFallback: false,
            };
        }

        if (Date.now() < fallbackDiscoveryDeadline) {
            return {
                targets: [doc.documentElement],
                usingFallback: true,
            };
        }

        return {
            targets: [],
            usingFallback: false,
        };
    }

    function refreshObservationTargets(page: PlatformPage): void {
        if (!mutationObserver) {
            return;
        }

        const nextObservation = resolveObservationTargets(page);
        const nextTargets = nextObservation.targets;

        if (nextObservation.usingFallback) {
            scheduleFallbackDiscoveryStop();
        } else {
            clearObservationDiscoveryTimeout();
        }

        if (
            nextTargets.length === observedTargets.length &&
            nextTargets.every((target, index) => target === observedTargets[index])
        ) {
            return;
        }

        mutationObserver.disconnect();
        observedTargets = nextTargets;

        for (const target of observedTargets) {
            mutationObserver.observe(target, {
                childList: true,
                subtree: true,
            });
        }
    }

    function startObserverOnce(): void {
        if (observerStarted) {
            return;
        }

        observerStarted = true;

        const routePollIntervalId = window.setInterval(() => {
            if (!options.adapter.isContextValid()) {
                return;
            }

            const page = getCurrentPage(options.adapter, doc);

            if (page.key !== activePageKey) {
                scheduleContributionRun();
            }
        }, routePollIntervalMs);

        mutationObserver = new MutationObserver(() => {
            scheduleContributionRun();
        });

        resetObservationDiscoveryWindow();
        refreshObservationTargets(getCurrentPage(options.adapter, doc));

        doc.defaultView?.addEventListener(
            'unload',
            () => {
                if (scheduledFrameId !== null) {
                    window.cancelAnimationFrame(scheduledFrameId);
                }

                window.clearInterval(routePollIntervalId);
                clearDeferredRetry();
                clearObservationDiscoveryTimeout();
                mutationObserver?.disconnect();
                mutationObserver = null;
                observedTargets = [];
                disposeActiveMounts();
            },
            { once: true }
        );
    }

    function init(): void {
        activePageKey = getCurrentPage(options.adapter, doc).key;
        runContributions();
        startObserverOnce();
    }

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', init, { once: true });
        return;
    }

    init();
}
