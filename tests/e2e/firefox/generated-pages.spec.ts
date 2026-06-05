import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const firefoxExtensionPath = resolve(process.cwd(), 'dist', 'firefox-mv3');

function expectFirefoxBuildAvailable(): void {
    expect(
        existsSync(resolve(firefoxExtensionPath, 'manifest.json')),
        'Run npm run build:firefox before Firefox browser E2E tests.'
    ).toBe(true);
}

async function openGeneratedExtensionPage(page: Page, fileName: string): Promise<string[]> {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });

    await page.goto(pathToFileURL(resolve(firefoxExtensionPath, fileName)).href);
    await page.waitForLoadState('domcontentloaded');

    return errors;
}

test.describe('Firefox generated extension pages', () => {
    test.beforeEach(() => {
        expectFirefoxBuildAvailable();
    });

    test('renders popup and dashboard pages in the Firefox engine without console errors', async ({
        page,
        context,
    }) => {
        const popupErrors = await openGeneratedExtensionPage(page, 'popup.html');

        await expect(page.locator('body')).toBeVisible();
        await expect(page.getByText('Frelancia').first()).toBeVisible();
        await expect(page.getByText('فتح لوحة التحكم')).toBeVisible();
        expect(popupErrors).toEqual([]);

        const dashboard = await context.newPage();
        const dashboardErrors = await openGeneratedExtensionPage(dashboard, 'dashboard.html');

        await expect(dashboard.locator('body')).toBeVisible();
        await expect(dashboard.getByText('النظرة العامة')).toBeVisible();
        await expect(dashboard.getByRole('tab', { name: 'الإعدادات المتقدمة' })).toBeVisible();
        expect(dashboardErrors).toEqual([]);
    });
});
