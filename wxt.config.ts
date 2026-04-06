import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'wxt';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

const icons = {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
} as const;

const hostPermissions = [
    'https://mostaql.com/*',
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
    'https://frelancia.runasp.net/*',
    'https://api.openai.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.anthropic.com/*',
] as const;

const sharedPermissions = ['alarms', 'downloads', 'notifications', 'storage'] as const;

export default defineConfig({
    // Keep WXT entrypoints separate from reusable source modules.
    srcDir: '.',
    entrypointsDir: 'entrypoints',
    publicDir: 'public',
    outDir: 'dist',
    outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
    vite: () => ({
        resolve: {
            alias: {
                '@': resolve(projectRoot, 'src'),
            },
        },
    }),
    manifest: ({ browser }) => {
        const isChrome = browser === 'chrome';

        return {
            name: 'Frelancia',
            short_name: 'Frelancia',
            version: '1.0.0',
            description: 'تنبيهات مشاريع مستقل مع توليد عروض بالذكاء الاصطناعي',
            action: {
                default_title: 'Frelancia',
                default_popup: 'popup/index.html',
                default_icon: icons,
            },
            options_ui: {
                page: 'dashboard.html',
                open_in_tab: true,
            },
            icons,
            permissions: isChrome ? [...sharedPermissions, 'offscreen'] : [...sharedPermissions],
            host_permissions: [...hostPermissions],
            minimum_chrome_version: isChrome ? '120' : undefined,
            browser_specific_settings: isChrome
                ? undefined
                : {
                    gecko: {
                        id: 'frelancia@mostaql-notifier',
                        strict_min_version: '140.0',
                        data_collection_permissions: {
                            required: ['websiteContent'],
                        },
                    },
                    gecko_android: {
                        strict_min_version: '142.0',
                    },
                },
        };
    },
});
