import { test, expect } from '@playwright/test';

import { launchChromiumExtension } from '../extension-fixtures';

test.describe('Chrome MV3 extension smoke', () => {
    test('starts the service worker and opens popup and dashboard pages', async () => {
        const { context, extensionId } = await launchChromiumExtension();
        const consoleErrors: string[] = [];

        try {
            const popup = await context.newPage();
            popup.on('console', (message) => {
                if (message.type() === 'error') {
                    consoleErrors.push(message.text());
                }
            });
            await popup.goto(`chrome-extension://${extensionId}/popup.html`);
            await expect(popup.locator('body')).toBeVisible();

            const dashboard = await context.newPage();
            dashboard.on('console', (message) => {
                if (message.type() === 'error') {
                    consoleErrors.push(message.text());
                }
            });
            await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`);
            await expect(dashboard.locator('body')).toBeVisible();

            expect(consoleErrors).toEqual([]);
        } finally {
            await context.close();
        }
    });

    test('loads a supported content-script fixture page without live marketplace traffic', async () => {
        const { context } = await launchChromiumExtension();
        const consoleErrors: string[] = [];

        try {
            await context.route('https://mostaql.com/projects?sort=latest', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html; charset=utf-8',
                    body: `
                        <!doctype html>
                        <html lang="ar" dir="rtl">
                            <body>
                                <main>
                                    <a href="/project/123-fixture">مشروع اختبار محلي</a>
                                </main>
                            </body>
                        </html>
                    `,
                });
            });

            const page = await context.newPage();
            page.on('console', (message) => {
                if (message.type() === 'error') {
                    consoleErrors.push(message.text());
                }
            });
            await page.goto('https://mostaql.com/projects?sort=latest');
            await expect(page.getByText('مشروع اختبار محلي')).toBeVisible();
            expect(consoleErrors).toEqual([]);
        } finally {
            await context.close();
        }
    });
});
