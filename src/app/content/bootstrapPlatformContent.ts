import type {
    PlatformAdapter,
    PlatformContributionMountResult,
    PlatformContentServices,
    PlatformDisposer,
    PlatformPage,
} from '../../platforms/contracts';

const DEFAULT_ROUTE_POLL_INTERVAL_MS = 500;

interface BootstrapPlatformContentOptions {
    readonly adapter: PlatformAdapter;
    readonly document?: Document;
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

    let activePageKey = '';
    let observerStarted = false;
    let scheduledFrameId: number | null = null;
    const activeDisposers = new Map<string, PlatformDisposer>();
    const mountedContributionIds = new Set<string>();

    function disposeActiveMounts(): void {
        for (const dispose of activeDisposers.values()) {
            dispose();
        }

        activeDisposers.clear();
        mountedContributionIds.clear();
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
            activePageKey = page.key;
        }

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
                continue;
            }

            mountedContributionIds.add(contribution.id);

            if (mountResult.dispose) {
                activeDisposers.set(contribution.id, mountResult.dispose);
            } else {
                activeDisposers.delete(contribution.id);
            }
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

        const observer = new MutationObserver(() => {
            scheduleContributionRun();
        });

        observer.observe(doc.documentElement, {
            childList: true,
            subtree: true,
        });

        doc.defaultView?.addEventListener(
            'unload',
            () => {
                if (scheduledFrameId !== null) {
                    window.cancelAnimationFrame(scheduledFrameId);
                }

                window.clearInterval(routePollIntervalId);
                observer.disconnect();
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
