import { afterEach, describe, expect, it, vi } from 'vitest';

const CHATGPT_HOSTS = ['https://chatgpt.com/*', 'https://chat.openai.com/*'] as const;
const PROVIDER_HOSTS = [
    'https://api.openai.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.anthropic.com/*',
] as const;

async function loadManifestFactory() {
    vi.resetModules();
    return import('../../wxt.config');
}

describe('manifest permission policy', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('keeps ChatGPT and direct provider hosts out of default required permissions', async () => {
        vi.stubEnv('WXT_ENABLE_UNSAFE_DIRECT_AI', 'false');
        const { createRasidManifest } = await loadManifestFactory();
        const manifest = createRasidManifest('chrome');

        expect(manifest.permissions).toEqual(
            expect.arrayContaining(['alarms', 'downloads', 'notifications', 'scripting', 'storage'])
        );
        expect(manifest.host_permissions).not.toEqual(expect.arrayContaining([...CHATGPT_HOSTS]));
        expect(manifest.host_permissions).not.toEqual(expect.arrayContaining([...PROVIDER_HOSTS]));
        expect(manifest.optional_host_permissions).toEqual(
            expect.arrayContaining([...CHATGPT_HOSTS])
        );
        expect(manifest.optional_host_permissions).not.toEqual(
            expect.arrayContaining([...PROVIDER_HOSTS])
        );
    });

    it('adds provider hosts only to optional permissions for unsafe side-load builds', async () => {
        vi.stubEnv('WXT_ENABLE_UNSAFE_DIRECT_AI', 'true');
        const { createRasidManifest } = await loadManifestFactory();
        const manifest = createRasidManifest('chrome');

        expect(manifest.host_permissions).not.toEqual(expect.arrayContaining([...PROVIDER_HOSTS]));
        expect(manifest.optional_host_permissions).toEqual(
            expect.arrayContaining([...CHATGPT_HOSTS, ...PROVIDER_HOSTS])
        );
    });
});
