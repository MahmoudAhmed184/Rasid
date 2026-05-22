import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 45_000,
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    use: {
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium-extension',
            testMatch: /chrome\/.*\.spec\.ts/,
        },
        {
            name: 'firefox-browser',
            testMatch: /firefox\/.*\.spec\.ts/,
            use: {
                browserName: 'firefox',
                headless: true,
            },
        },
    ],
});
