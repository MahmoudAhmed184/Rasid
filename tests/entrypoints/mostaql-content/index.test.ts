import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installTestDom } from '../../support/html';

const contentEntrypointMocks = vi.hoisted(() => {
    const repositories = {
        promptRepository: { id: 'promptRepository' },
        proposalRepository: { id: 'proposalRepository' },
        trackingRepository: { id: 'trackingRepository' },
    };
    const services = { id: 'platformContentServices' };
    const createPlatformContentRepositories = vi.fn(() => repositories);
    const createPlatformContentServices = vi.fn(() => services);
    const bootstrapPlatformContent = vi.fn();
    const bootstrapPlatformAutofill = vi.fn();
    const defineContentScript = vi.fn((definition: unknown) => definition);

    return {
        repositories,
        services,
        createPlatformContentRepositories,
        createPlatformContentServices,
        bootstrapPlatformContent,
        bootstrapPlatformAutofill,
        defineContentScript,
        reset() {
            createPlatformContentRepositories.mockReset().mockReturnValue(repositories);
            createPlatformContentServices.mockReset().mockReturnValue(services);
            bootstrapPlatformContent.mockReset();
            bootstrapPlatformAutofill.mockReset();
            defineContentScript.mockReset().mockImplementation((definition: unknown) => definition);
        },
    };
});

vi.mock('wxt/utils/define-content-script', () => ({
    defineContentScript: contentEntrypointMocks.defineContentScript,
}));

vi.mock('../../../src/app/repositories/browser-repositories', () => ({
    createPlatformContentRepositories: contentEntrypointMocks.createPlatformContentRepositories,
}));

vi.mock('../../../src/app/content/createPlatformContentServices', () => ({
    createPlatformContentServices: contentEntrypointMocks.createPlatformContentServices,
}));

vi.mock('../../../src/app/content/bootstrapPlatformContent', () => ({
    bootstrapPlatformContent: contentEntrypointMocks.bootstrapPlatformContent,
}));

vi.mock('../../../src/app/content/bootstrapPlatformAutofill', () => ({
    bootstrapPlatformAutofill: contentEntrypointMocks.bootstrapPlatformAutofill,
}));

interface ContentScriptDefinition {
    readonly matches: readonly string[];
    readonly runAt: string;
    main(): void;
}

interface BootstrapContentInput {
    readonly adapter: {
        readonly id: string;
    };
    readonly document: Document;
    readonly services: unknown;
}

interface BootstrapAutofillInput {
    readonly adapter: {
        readonly id: string;
    };
    readonly document: Document;
    readonly proposalRepository: unknown;
}

const entrypoints = [
    {
        id: 'mostaql',
        matches: ['https://mostaql.com/*'],
        load: () => import('../../../entrypoints/mostaql.content/index'),
    },
    {
        id: 'khamsat',
        matches: ['https://khamsat.com/*'],
        load: () => import('../../../entrypoints/khamsat.content/index'),
    },
    {
        id: 'nafezly',
        matches: ['https://nafezly.com/*'],
        load: () => import('../../../entrypoints/nafezly.content/index'),
    },
] as const;

describe('marketplace content script entrypoints', () => {
    beforeEach(() => {
        contentEntrypointMocks.reset();
        vi.resetModules();
    });

    it.each(entrypoints)('boots %s content script with platform services', async (entrypoint) => {
        const document = installTestDom();
        const definition = (await entrypoint.load()).default as ContentScriptDefinition;

        expect(definition.matches).toEqual(entrypoint.matches);
        expect(definition.runAt).toBe('document_idle');

        definition.main();

        expect(contentEntrypointMocks.createPlatformContentRepositories).toHaveBeenCalledOnce();
        expect(contentEntrypointMocks.createPlatformContentServices).toHaveBeenCalledWith({
            promptRepository: contentEntrypointMocks.repositories.promptRepository,
            proposalRepository: contentEntrypointMocks.repositories.proposalRepository,
            trackingRepository: contentEntrypointMocks.repositories.trackingRepository,
        });

        const contentInput = contentEntrypointMocks.bootstrapPlatformContent.mock
            .calls[0]?.[0] as BootstrapContentInput;
        expect(contentInput).toMatchObject({
            adapter: { id: entrypoint.id },
            document,
            services: contentEntrypointMocks.services,
        });

        const autofillInput = contentEntrypointMocks.bootstrapPlatformAutofill.mock
            .calls[0]?.[0] as BootstrapAutofillInput;
        expect(autofillInput).toMatchObject({
            adapter: { id: entrypoint.id },
            document,
            proposalRepository: contentEntrypointMocks.repositories.proposalRepository,
        });
    });
});
