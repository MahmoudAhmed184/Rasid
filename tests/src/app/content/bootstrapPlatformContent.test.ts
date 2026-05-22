import { describe, expect, it, vi } from 'vitest';

import { bootstrapPlatformContent } from '../../../../src/app/content/bootstrapPlatformContent';
import type {
    PlatformAdapter,
    PlatformContentServices,
    PlatformPage,
} from '../../../../src/platforms/contracts';
import { installTestDom } from '../../../support/html';

let triggerObservedMutation: (() => void) | null = null;

function installDomRuntimeShims(url = 'https://mostaql.com/project/1'): void {
    class TestMutationObserver {
        constructor(callback: MutationCallback) {
            triggerObservedMutation = () => callback([], this as unknown as MutationObserver);
        }

        disconnect = vi.fn();
        observe = vi.fn();
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
            setPendingBridgePrompt: async () => undefined,
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
});
