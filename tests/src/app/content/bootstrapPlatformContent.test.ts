import { describe, expect, it, vi } from 'vitest';

import { bootstrapPlatformContent } from '../../../../src/app/content/bootstrapPlatformContent';
import type {
    PlatformAdapter,
    PlatformContentServices,
    PlatformPage,
} from '../../../../src/platforms/contracts';
import { installTestDom } from '../../../support/html';

let triggerObservedMutation: (() => void) | null = null;
let observedTargets: Element[] = [];
let observerDisconnects: Array<ReturnType<typeof vi.fn>> = [];

function installDomRuntimeShims(url = 'https://mostaql.com/project/1'): void {
    observedTargets = [];
    observerDisconnects = [];

    class TestMutationObserver {
        disconnect = vi.fn();

        constructor(callback: MutationCallback) {
            triggerObservedMutation = () => callback([], this as unknown as MutationObserver);
            observerDisconnects.push(this.disconnect);
        }

        observe = vi.fn((target: Element) => {
            observedTargets.push(target);
        });
    }

    Object.defineProperty(globalThis, 'MutationObserver', {
        configurable: true,
        value: TestMutationObserver,
    });
    Object.defineProperty(window, 'setInterval', {
        configurable: true,
        value: setInterval,
    });
    Object.defineProperty(window, 'clearInterval', {
        configurable: true,
        value: clearInterval,
    });
    Object.defineProperty(window, 'setTimeout', {
        configurable: true,
        value: setTimeout,
    });
    Object.defineProperty(window, 'clearTimeout', {
        configurable: true,
        value: clearTimeout,
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(1), 0),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
        configurable: true,
        value: (id: number) => window.clearTimeout(id),
    });
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL(url),
    });
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: new URL(url),
    });
}

function createServices(): PlatformContentServices {
    return {
        prompts: {
            list: async () => [],
            save: async (draft) => ({
                id: draft.id ?? 'prompt',
                title: draft.title,
                content: draft.content,
            }),
        },
        tracking: {
            list: async () => [],
            isTracked: async () => false,
            toggle: async () => 'tracked',
        },
        proposals: {
            getQuickTemplate: async () => '',
            generate: async () => ({ kind: 'error', message: 'not used' }),
            queueAutofill: async () => undefined,
            openBridgePrompt: async () => undefined,
        },
        downloads: {
            downloadZip: async () => undefined,
        },
        toast: vi.fn(),
    };
}

describe('platform content bootstrap', () => {
    it('mounts matching contributions once and remounts on route changes with cleanup', async () => {
        vi.useFakeTimers();
        const document = installTestDom('<main id="root"></main>');
        installDomRuntimeShims();
        const firstDispose = vi.fn();
        const secondDispose = vi.fn();
        const mount = vi
            .fn()
            .mockReturnValueOnce({ kind: 'mounted', dispose: firstDispose })
            .mockReturnValueOnce({ kind: 'mounted', dispose: secondDispose });
        let currentPage: PlatformPage = { kind: 'project', key: 'project:1', projectId: '1' };
        const adapter = {
            id: 'mostaql',
            displayName: 'Mostaql',
            matches: ['https://mostaql.com/*'],
            isContextValid: () => true,
            matchPage: () => currentPage,
            extractProposalSource: () => null,
            ui: [{ id: 'project-tools', pages: ['project'], mount }],
            applyProposalAutofill: async () => ({ kind: 'applied' }),
        } satisfies PlatformAdapter;

        bootstrapPlatformContent({
            adapter,
            document,
            routePollIntervalMs: 25,
            services: createServices(),
        });

        expect(mount).toHaveBeenCalledTimes(1);
        expect(mount).toHaveBeenLastCalledWith(
            expect.objectContaining({
                page: { kind: 'project', key: 'project:1', projectId: '1' },
                document,
            })
        );

        await vi.advanceTimersByTimeAsync(25);
        expect(mount).toHaveBeenCalledTimes(1);

        currentPage = { kind: 'project', key: 'project:2', projectId: '2' };
        triggerObservedMutation?.();
        await vi.advanceTimersByTimeAsync(0);

        expect(firstDispose).toHaveBeenCalledOnce();
        expect(mount).toHaveBeenCalledTimes(2);

        document.defaultView?.dispatchEvent(new Event('unload'));
        expect(secondDispose).toHaveBeenCalledOnce();
    });

    it('skips invalid contexts and contributions for other page kinds', () => {
        const document = installTestDom('<main></main>');
        installDomRuntimeShims();
        const mount = vi.fn();
        const adapter = {
            id: 'khamsat',
            displayName: 'Khamsat',
            matches: ['https://khamsat.com/*'],
            isContextValid: () => false,
            matchPage: () => ({ kind: 'other', key: '/community' }),
            extractProposalSource: () => null,
            ui: [{ id: 'project-tools', pages: ['project'], mount }],
            applyProposalAutofill: async () => ({ kind: 'applied' }),
        } satisfies PlatformAdapter;

        bootstrapPlatformContent({
            adapter,
            document,
            routePollIntervalMs: 25,
            services: createServices(),
        });

        expect(mount).not.toHaveBeenCalled();
    });

    it('waits for DOMContentLoaded and retries deferred contributions on later mutations', async () => {
        vi.useFakeTimers();
        const document = installTestDom('<main id="root"></main>');
        Object.defineProperty(document, 'readyState', {
            configurable: true,
            value: 'loading',
        });
        installDomRuntimeShims('https://nafezly.com/project/77');
        const dispose = vi.fn();
        const mount = vi
            .fn()
            .mockReturnValueOnce({ kind: 'deferred' as const })
            .mockReturnValueOnce({ kind: 'mounted' as const, dispose })
            .mockReturnValueOnce({ kind: 'mounted' as const });
        const adapter = {
            id: 'nafezly',
            displayName: 'Nafezly',
            matches: ['https://nafezly.com/*'],
            isContextValid: () => true,
            matchPage: () => ({ kind: 'project', key: 'project:77', projectId: '77' }) as const,
            extractProposalSource: () => null,
            ui: [
                { id: 'project-tools', pages: ['project'], mount },
                { id: 'home-tools', pages: ['home'], mount: vi.fn() },
            ],
            applyProposalAutofill: async () => ({ kind: 'applied' as const }),
        } satisfies PlatformAdapter;

        bootstrapPlatformContent({
            adapter,
            document,
            routePollIntervalMs: 25,
            services: createServices(),
        });

        expect(mount).not.toHaveBeenCalled();

        document.dispatchEvent(new Event('DOMContentLoaded'));
        expect(mount).toHaveBeenCalledOnce();

        triggerObservedMutation?.();
        await vi.advanceTimersByTimeAsync(0);

        expect(mount).toHaveBeenCalledTimes(2);

        triggerObservedMutation?.();
        await vi.advanceTimersByTimeAsync(0);

        expect(mount).toHaveBeenCalledTimes(2);
        document.defaultView?.dispatchEvent(new Event('unload'));
        expect(dispose).toHaveBeenCalledOnce();
    });

    it('observes adapter-provided stable targets and falls back when none are available', () => {
        const document = installTestDom('<main id="stable"></main>');
        installDomRuntimeShims();
        const stableTarget = document.getElementById('stable')!;
        const adapter = {
            id: 'mostaql',
            displayName: 'Mostaql',
            matches: ['https://mostaql.com/*'],
            isContextValid: () => true,
            matchPage: () => ({ kind: 'project', key: 'project:1', projectId: '1' }) as const,
            getObservationTargets: () => [stableTarget],
            extractProposalSource: () => null,
            ui: [],
            applyProposalAutofill: async () => ({ kind: 'applied' as const }),
        } satisfies PlatformAdapter;

        bootstrapPlatformContent({
            adapter,
            document,
            routePollIntervalMs: 25,
            services: createServices(),
        });

        expect(observedTargets.at(-1)).toBe(stableTarget);

        const fallbackDocument = installTestDom('<main></main>');
        installDomRuntimeShims();
        bootstrapPlatformContent({
            adapter: {
                ...adapter,
                getObservationTargets: () => [],
            },
            document: fallbackDocument,
            routePollIntervalMs: 25,
            services: createServices(),
        });

        expect(observedTargets.at(-1)).toBe(fallbackDocument.documentElement);
    });

    it('stops broad fallback observation after the discovery window', async () => {
        vi.useFakeTimers();
        const document = installTestDom('<main></main>');
        installDomRuntimeShims();
        const adapter = {
            id: 'khamsat',
            displayName: 'Khamsat',
            matches: ['https://khamsat.com/*'],
            isContextValid: () => true,
            matchPage: () => ({ kind: 'project', key: 'project:1', projectId: '1' }) as const,
            getObservationTargets: () => [],
            extractProposalSource: () => null,
            ui: [],
            applyProposalAutofill: async () => ({ kind: 'applied' as const }),
        } satisfies PlatformAdapter;

        bootstrapPlatformContent({
            adapter,
            document,
            observationDiscoveryWindowMs: 50,
            routePollIntervalMs: 25,
            services: createServices(),
        });

        expect(observedTargets.at(-1)).toBe(document.documentElement);
        const disconnect = observerDisconnects.at(-1);
        if (!disconnect) {
            throw new Error('Expected observer disconnect spy.');
        }
        expect(disconnect).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(50);

        expect(disconnect).toHaveBeenCalledTimes(2);
    });

    it('switches from fallback observation to late adapter targets', async () => {
        vi.useFakeTimers();
        const document = installTestDom('<main></main>');
        installDomRuntimeShims();
        const adapter = {
            id: 'mostaql',
            displayName: 'Mostaql',
            matches: ['https://mostaql.com/*'],
            isContextValid: () => true,
            matchPage: () => ({ kind: 'project', key: 'project:1', projectId: '1' }) as const,
            getObservationTargets: ({ document }) =>
                [...document.querySelectorAll<Element>('[data-observe-target]')],
            extractProposalSource: () => null,
            ui: [],
            applyProposalAutofill: async () => ({ kind: 'applied' as const }),
        } satisfies PlatformAdapter;

        bootstrapPlatformContent({
            adapter,
            document,
            observationDiscoveryWindowMs: 1_000,
            routePollIntervalMs: 25,
            services: createServices(),
        });

        expect(observedTargets.at(-1)).toBe(document.documentElement);

        const lateTarget = document.createElement('section');
        lateTarget.dataset.observeTarget = 'true';
        document.body.append(lateTarget);
        triggerObservedMutation?.();
        await vi.advanceTimersByTimeAsync(0);

        expect(observedTargets.at(-1)).toBe(lateTarget);
    });

    it('retries deferred contributions with bounded backoff', async () => {
        vi.useFakeTimers();
        const document = installTestDom('<main></main>');
        installDomRuntimeShims('https://nafezly.com/project/77');
        const mount = vi.fn(() => ({ kind: 'deferred' as const }));
        const adapter = {
            id: 'nafezly',
            displayName: 'Nafezly',
            matches: ['https://nafezly.com/*'],
            isContextValid: () => true,
            matchPage: () => ({ kind: 'project', key: 'project:77', projectId: '77' }) as const,
            extractProposalSource: () => null,
            ui: [{ id: 'project-tools', pages: ['project'], mount }],
            applyProposalAutofill: async () => ({ kind: 'applied' as const }),
        } satisfies PlatformAdapter;

        bootstrapPlatformContent({
            adapter,
            document,
            deferredRetryDelaysMs: [10, 20],
            observationDiscoveryWindowMs: 1_000,
            routePollIntervalMs: 1_000,
            services: createServices(),
        });

        expect(mount).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(10);
        await vi.advanceTimersByTimeAsync(1);
        expect(mount).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(20);
        await vi.advanceTimersByTimeAsync(1);
        expect(mount).toHaveBeenCalledTimes(3);

        await vi.advanceTimersByTimeAsync(100);
        expect(mount).toHaveBeenCalledTimes(3);
    });
});
