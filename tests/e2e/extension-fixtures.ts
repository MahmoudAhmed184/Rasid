import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
    const heliumPath =
        process.env.RASID_E2E_CHROMIUM_PATH ||
        (existsSync('/usr/bin/helium-browser') ? '/usr/bin/helium-browser' : undefined);

    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: heliumPath ? undefined : 'chromium',
        executablePath: heliumPath,
        headless: false,
        args: [
            '--headless=new',
            `--disable-extensions-except=${chromeExtensionPath}`,
            `--load-extension=${chromeExtensionPath}`,
        ],
    });

    context.on('close', () => {
        try {
            rmSync(userDataDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup failure
        }
    });

    let [serviceWorker] = context.serviceWorkers();

    if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker');
    }

    const extensionId = new URL(serviceWorker.url()).host;

    return { context, extensionId };
}
