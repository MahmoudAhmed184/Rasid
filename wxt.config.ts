import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

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
] as const;

const basePermissions = ['notifications', 'alarms', 'storage', 'downloads'] as const;

const contentScripts = [
    {
        matches: ['https://mostaql.com/*'],
        js: [
            'vendor/browser-polyfill.js',
            'lib/browser-api.js',
            'content/utils.js',
            'content/data.js',
            'content/prompts.js',
            'content/autofill.js',
            'content/project-sidebar.js',
            'content/export.js',
            'content/home.js',
            'content/profile.js',
            'content/init.js',
        ],
        css: ['content.css'],
    },
    {
        matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
        js: ['vendor/browser-polyfill.js', 'lib/browser-api.js', 'chatgpt.js'],
    },
] as const;

const firefoxBackgroundScripts = [
    'vendor/browser-polyfill.js',
    'lib/browser-api.js',
    'bg/constants.js',
    'bg/html-parser.js',
    'jszip.min.js',
    'signalr.min.js',
    'signalr-client.js',
    'bg/filters.js',
    'bg/offscreen.js',
    'bg/audio.js',
    'bg/notifications.js',
    'bg/fetcher.js',
    'bg/tracker.js',
    'bg/job-checker.js',
    'bg/signalr.js',
    'bg/install.js',
    'bg/alarm-handler.js',
    'bg/message-handler.js',
    'background-firefox.js',
] as const;

export default defineConfig({
    srcDir: 'src',
    outDir: 'dist',
    outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
    hooks: {
        'build:done': async (wxt, output) => {
            const transientArtifacts = new Set(['wxt-placeholder.js']);

            for (const step of output.steps) {
                step.chunks = step.chunks.filter(
                    (chunk) => !transientArtifacts.has(chunk.fileName)
                );
            }

            output.steps.splice(
                0,
                output.steps.length,
                ...output.steps.filter((step) => step.chunks.length > 0)
            );

            await Promise.all(
                [...transientArtifacts].map((fileName) =>
                    rm(resolve(wxt.config.outDir, fileName), { force: true })
                )
            );
        },
        'build:publicAssets': (wxt, files) => {
            const excludedFiles =
                wxt.config.browser === 'firefox'
                    ? ['background.js', 'offscreen.html', 'offscreen.js']
                    : wxt.config.browser === 'chrome'
                      ? ['background-firefox.js']
                      : [];

            const safeFiles = files.filter(
                (file) => !excludedFiles.includes(file.relativeDest)
            );

            files.splice(0, files.length, ...safeFiles);
        },
    },
    manifest: ({ browser }) => ({
        name: 'Mostaql Job Notifier + AI Proposal',
        version: '1.0.0',
        description: 'تنبيهات فورية للمشاريع الجديدة على مستقل مع إنشاء عروض بالذكاء الاصطناعي',
        permissions:
            browser === 'chrome' ? [...basePermissions, 'offscreen'] : [...basePermissions],
        host_permissions: [...hostPermissions],
        content_scripts: contentScripts.map((script) => ({ ...script })),
        action: {
            default_popup: 'popup.html',
            default_icon: icons,
        },
        icons,
        background:
            browser === 'firefox'
                ? {
                      scripts: [...firefoxBackgroundScripts],
                  }
                : {
                      service_worker: 'background.js',
                  },
        browser_specific_settings:
            browser === 'firefox'
                ? {
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
                  }
                : undefined,
    }),
});
