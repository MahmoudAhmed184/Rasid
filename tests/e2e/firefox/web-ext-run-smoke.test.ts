import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { firefox } from '@playwright/test';
import { describe, expect, it } from 'vitest';

interface WebExtRunResult {
    readonly code: number | null;
    readonly output: string;
    readonly sawTemporaryInstall: boolean;
    readonly signal: NodeJS.Signals | null;
    readonly timedOut: boolean;
}

const FIREFOX_EXTENSION_PATH = resolve(process.cwd(), 'dist', 'firefox-mv3');
const WEB_EXT_RUN_TIMEOUT_MS = 20_000;

function runFirefoxTemporaryInstallSmoke(): Promise<WebExtRunResult> {
    const firefoxPath = firefox.executablePath();

    expect(
        existsSync(firefoxPath),
        'Run npx playwright install firefox before Firefox web-ext E2E smoke tests.'
    ).toBe(true);

    return new Promise((resolveResult, reject) => {
        let output = '';
        let sawTemporaryInstall = false;
        let timedOut = false;

        const child = spawn(
            process.platform === 'win32' ? 'npx.cmd' : 'npx',
            [
                'web-ext',
                'run',
                '--source-dir',
                FIREFOX_EXTENSION_PATH,
                '--target',
                'firefox-desktop',
                '--firefox',
                firefoxPath,
                '--no-reload',
                '--start-url',
                'about:blank',
                '--arg=-headless',
            ],
            {
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    FORCE_COLOR: '0',
                    NO_COLOR: '1',
                },
                stdio: ['ignore', 'pipe', 'pipe'],
            }
        );

        const timeout = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
        }, WEB_EXT_RUN_TIMEOUT_MS);

        const appendOutput = (chunk: Buffer): void => {
            output += chunk.toString('utf8');

            if (
                output.includes('Installed') &&
                output.includes('as a temporary add-on') &&
                !sawTemporaryInstall
            ) {
                sawTemporaryInstall = true;
                child.kill('SIGTERM');
            }
        };

        child.stdout.on('data', appendOutput);
        child.stderr.on('data', appendOutput);
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on('exit', (code, signal) => {
            clearTimeout(timeout);
            resolveResult({
                code,
                output,
                sawTemporaryInstall,
                signal,
                timedOut,
            });
        });
    });
}

describe('Firefox temporary extension install smoke', () => {
    it(
        'loads the generated Firefox MV3 extension as a temporary add-on through web-ext',
        async () => {
            if (process.env.RASID_RUN_FIREFOX_BROWSER_SMOKE !== '1') {
                expect
                    .soft(
                        true,
                        'Firefox web-ext smoke is skipped outside npm run test:e2e:firefox.'
                    )
                    .toBe(true);
                return;
            }

            expect(
                existsSync(resolve(FIREFOX_EXTENSION_PATH, 'manifest.json')),
                'Run npm run build:firefox before Firefox web-ext E2E smoke tests.'
            ).toBe(true);

            const result = await runFirefoxTemporaryInstallSmoke();

            expect(result.sawTemporaryInstall, result.output).toBe(true);
            expect(result.timedOut, result.output).toBe(false);
            expect(result.output).not.toMatch(/ValidationError|WebExtError|Error:/i);
            expect(result.code === 0 || result.signal === 'SIGTERM', result.output).toBe(true);
        },
        WEB_EXT_RUN_TIMEOUT_MS + 5_000
    );
});
