import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, expect, type BrowserContext } from '@playwright/test';

export interface LoadedExtensionContext {
    readonly context: BrowserContext;
    readonly extensionId: string;
}

export const chromeExtensionPath = resolve(process.cwd(), 'dist', 'chrome-mv3');

export function expectChromeBuildAvailable(): void {
    expect(
        existsSync(chromeExtensionPath),
        'Run npm run build:chrome before Playwright extension E2E tests.'
    ).toBe(true);
}

export async function launchChromiumExtension(): Promise<LoadedExtensionContext> {
    expectChromeBuildAvailable();

    const userDataDir = mkdtempSync(resolve(tmpdir(), 'rasid-extension-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: false,
        args: [
            `--disable-extensions-except=${chromeExtensionPath}`,
            `--load-extension=${chromeExtensionPath}`,
        ],
    });
    let [serviceWorker] = context.serviceWorkers();

    if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker');
    }

    const extensionId = new URL(serviceWorker.url()).host;

    return { context, extensionId };
}
