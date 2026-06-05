import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CHATGPT_HOSTS = ['https://chatgpt.com/*', 'https://chat.openai.com/*'] as const;

function readGeneratedManifest(browser: 'chrome' | 'firefox'): Record<string, unknown> | null {
    const manifestPath = `dist/${browser}-mv3/manifest.json`;

    if (!existsSync(manifestPath)) {
        return null;
    }

    return JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
}

function readGeneratedBackground(browser: 'chrome' | 'firefox'): string | null {
    const extensionDir = `dist/${browser}-mv3`;
    const manifestPath = `${extensionDir}/manifest.json`;

    if (!existsSync(manifestPath)) {
        return null;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        readonly background?: {
            readonly service_worker?: string;
            readonly scripts?: string[];
        };
    };
    const backgroundPath =
        manifest.background?.service_worker ?? manifest.background?.scripts?.[0] ?? 'background.js';
    const bundlePath = `${extensionDir}/${backgroundPath}`;

    return existsSync(bundlePath) ? readFileSync(bundlePath, 'utf8') : null;
}

describe('Firefox release smoke', () => {
    it('validates the generated Firefox manifest when the build output exists', () => {
        const manifestPath = 'dist/firefox-mv3/manifest.json';

        if (!existsSync(manifestPath)) {
            expect
                .soft(true, 'Firefox manifest smoke is skipped until npm run build:firefox runs.')
                .toBe(true);
            return;
        }

        const manifestText = readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestText) as Record<string, unknown>;

        expect(manifest.manifest_version).toBe(3);
        expect(manifest.browser_specific_settings).toBeDefined();
        expect(manifest.permissions).toContain('notifications');
    });

    it('omits rich notification action fields from the generated Firefox background bundle', () => {
        const background = readGeneratedBackground('firefox');

        if (!background) {
            expect
                .soft(true, 'Firefox background smoke is skipped until npm run build:firefox runs.')
                .toBe(true);
            return;
        }

        expect(background).not.toContain('عرض تفاصيل المشروع');
        expect(background).not.toMatch(/\bbuttons\b/);
    });

    it('keeps Chrome rich notification actions when the Chrome build output exists', () => {
        const background = readGeneratedBackground('chrome');

        if (!background) {
            expect
                .soft(true, 'Chrome background smoke is skipped until npm run build:chrome runs.')
                .toBe(true);
            return;
        }

        expect(background).toContain('عرض تفاصيل المشروع');
        expect(background).toMatch(/\bbuttons\b/);
    });

    it('keeps ChatGPT hosts optional and out of static content scripts when build output exists', () => {
        const manifest = readGeneratedManifest('chrome');

        if (!manifest) {
            expect
                .soft(true, 'Chrome manifest smoke is skipped until npm run build:chrome runs.')
                .toBe(true);
            return;
        }

        expect(manifest.host_permissions).not.toEqual(expect.arrayContaining([...CHATGPT_HOSTS]));
        expect(manifest.optional_host_permissions).toEqual(
            expect.arrayContaining([...CHATGPT_HOSTS])
        );

        const contentScripts = Array.isArray(manifest.content_scripts)
            ? manifest.content_scripts
            : [];
        expect(JSON.stringify(contentScripts)).not.toContain('chatgpt.com');
        expect(JSON.stringify(contentScripts)).not.toContain('chat.openai.com');
    });
});
