import { describe, expect, it } from 'vitest';

import {
    createBrowserRepositories,
    createChatGptBridgeRepositories,
    createPlatformContentRepositories,
} from '../../../../src/app/repositories/browser-repositories';

describe('browser repository composition', () => {
    it('creates the full browser repository graph over browser storage clients', async () => {
        const repositories = createBrowserRepositories();

        expect(repositories).toEqual(
            expect.objectContaining({
                extensionStorage: expect.any(Object),
                backupRepository: expect.any(Object),
                monitoringRepository: expect.any(Object),
                promptRepository: expect.any(Object),
                proposalRepository: expect.any(Object),
                settingsRepository: expect.any(Object),
                trackingRepository: expect.any(Object),
            })
        );
        await expect(repositories.extensionStorage.ensureDefaults()).resolves.toMatchObject({
            settings: expect.objectContaining({
                systemEnabled: true,
                monitoredPlatforms: {
                    mostaql: true,
                    khamsat: true,
                    nafezly: true,
                },
            }),
        });
    });

    it('creates scoped repository graphs for content scripts and the ChatGPT bridge', () => {
        expect(createPlatformContentRepositories()).toEqual({
            promptRepository: expect.any(Object),
            proposalRepository: expect.any(Object),
            trackingRepository: expect.any(Object),
        });
        expect(createChatGptBridgeRepositories()).toEqual({
            proposalRepository: expect.any(Object),
        });
    });
});
