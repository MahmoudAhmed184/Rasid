import { defineConfig } from 'wxt';
import packageJson from './package.json';
import type { Plugin } from 'vite';

const icons = {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
} as const;

const hostPermissions = [
    'https://mostaql.com/*',
    'https://khamsat.com/*',
    'https://nafezly.com/*',
    'https://rasid.runasp.net/*',
    'http://localhost/*',
] as const;

const chatBridgeHostPermissions = ['https://chatgpt.com/*', 'https://chat.openai.com/*'] as const;

const unsafeDirectAiHostPermissions = [
    'https://api.openai.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.anthropic.com/*',
] as const;

const sharedPermissions = ['alarms', 'downloads', 'notifications', 'scripting', 'storage'] as const;

function isUnsafeDirectAiEnabled(): boolean {
    return process.env.WXT_ENABLE_UNSAFE_DIRECT_AI === 'true';
}

export function createRasidManifest(browser: string) {
    const isChrome = browser === 'chrome';

    return {
        name: 'Frelancia | فريلانسيا',
        short_name: 'Frelancia',
        version: packageJson.version,
        description: 'تنبيهات فرص العمل الحر مع توليد عروض بالذكاء الاصطناعي',
        action: {
            default_title: 'Frelancia | فريلانسيا',
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
        optional_host_permissions: [
            ...chatBridgeHostPermissions,
            ...(isUnsafeDirectAiEnabled() ? unsafeDirectAiHostPermissions : []),
        ],
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
}

function stripSignalRInvalidPureAnnotations(): Plugin {
    return {
        name: 'strip-signalr-invalid-pure-annotations',
        enforce: 'pre',
        transform(code, id) {
            const normalizedId = id.replace(/\\/g, '/');

            if (!normalizedId.endsWith('/node_modules/@microsoft/signalr/dist/esm/Utils.js')) {
                return null;
            }

            const updatedCode = code.replace(
                /\/\/ eslint-disable-next-line spaced-comment\r?\n\/\*#__PURE__\*\/ function (getOsName|getRuntimeVersion)\(/g,
                'function $1('
            );

            return updatedCode === code ? null : { code: updatedCode, map: null };
        },
    };
}

export default defineConfig({
    // Keep WXT entrypoints separate from reusable source modules.
    srcDir: '.',
    entrypointsDir: 'entrypoints',
    publicDir: 'public',
    outDir: 'dist',
    outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
    manifestVersion: 3,
    zip: {
        artifactTemplate: 'frelancia-v{{version}}-{{browser}}-{{manifestVersion}}.zip',
        sourcesTemplate: 'frelancia-v{{version}}-{{browser}}-sources.zip',
        excludeSources: [
            'coverage/**',
            'playwright-report/**',
            'server/**',
            'test-results/**',
            'tests/**',
        ],
    },
    vite: () => ({
        plugins: [stripSignalRInvalidPureAnnotations()],
    }),
    hooks: {
        'entrypoints:found': (wxt, entrypoints) => {
            if (wxt.config.browser === 'chrome') {
                return;
            }

            const offscreenIndex = entrypoints.findIndex(
                (entrypoint) => entrypoint.name === 'offscreen'
            );
            if (offscreenIndex >= 0) {
                entrypoints.splice(offscreenIndex, 1);
            }
        },
        'prepare:publicPaths': (_, paths) => {
            paths.push('/offscreen.html');
        },
    },
    manifest: ({ browser }) => createRasidManifest(browser),
});
