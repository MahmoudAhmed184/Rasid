import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeEntrypointMocks = vi.hoisted(() => {
    const repositories = {
        proposalRepository: { id: 'proposalRepository' },
    };
    const createChatGptBridgeRepositories = vi.fn(() => repositories);
    const initChatgptBridge = vi.fn();
    const defineUnlistedScript = vi.fn((definition: unknown) => definition);

    return {
        repositories,
        createChatGptBridgeRepositories,
        initChatgptBridge,
        defineUnlistedScript,
        reset() {
            createChatGptBridgeRepositories.mockReset().mockReturnValue(repositories);
            initChatgptBridge.mockReset();
            defineUnlistedScript
                .mockReset()
                .mockImplementation((definition: unknown) => definition);
        },
    };
});

vi.mock('wxt/utils/define-unlisted-script', () => ({
    defineUnlistedScript: bridgeEntrypointMocks.defineUnlistedScript,
}));

vi.mock('../../src/app/repositories/browser-repositories', () => ({
    createChatGptBridgeRepositories: bridgeEntrypointMocks.createChatGptBridgeRepositories,
}));

vi.mock('../../src/app/chatgpt-bridge', () => ({
    initChatgptBridge: bridgeEntrypointMocks.initChatgptBridge,
}));

interface UnlistedScriptDefinition {
    main(): void;
}

describe('ChatGPT bridge unlisted entrypoint', () => {
    beforeEach(() => {
        bridgeEntrypointMocks.reset();
        vi.resetModules();
    });

    it('boots the bridge without declaring static ChatGPT content-script matches', async () => {
        const definition = (await import('../../entrypoints/chatgpt-bridge')).default as
            | UnlistedScriptDefinition
            | undefined;

        expect(bridgeEntrypointMocks.defineUnlistedScript).toHaveBeenCalledOnce();
        expect(definition).toBeDefined();

        definition?.main();

        expect(bridgeEntrypointMocks.createChatGptBridgeRepositories).toHaveBeenCalledOnce();
        expect(bridgeEntrypointMocks.initChatgptBridge).toHaveBeenCalledWith({
            proposalRepository: bridgeEntrypointMocks.repositories.proposalRepository,
        });
    });
});
