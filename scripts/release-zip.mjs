import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, '.output');
const distDir = path.join(root, 'dist');
const version = packageJson.version;
const expectedArtifacts = [
    `frelancia-v${version}-chrome-mv3.zip`,
    `frelancia-v${version}-firefox-mv3.zip`,
    `frelancia-v${version}-firefox-sources.zip`,
];

function runWxtZip(browser) {
    const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(executable, ['wxt', 'zip', '-b', browser, '--mv3'], {
        cwd: root,
        stdio: 'inherit',
    });

    if (result.status !== 0) {
        throw new Error(`wxt zip failed for ${browser}`);
    }
}

async function removeDistReleaseZips() {
    if (!existsSync(distDir)) {
        return;
    }

    const entries = await readdir(distDir);
    const releaseZipPrefix = `frelancia-v${version}-`;

    await Promise.all(
        entries
            .filter((entry) => entry.startsWith(releaseZipPrefix) && entry.endsWith('.zip'))
            .map((entry) => rm(path.join(distDir, entry), { force: true }))
    );
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await removeDistReleaseZips();

runWxtZip('chrome');
runWxtZip('firefox');

for (const artifact of expectedArtifacts) {
    const sourcePath = path.join(distDir, artifact);
    const outputPath = path.join(outputDir, artifact);

    if (!existsSync(sourcePath)) {
        throw new Error(`Expected WXT ZIP was not created: ${sourcePath}`);
    }

    await rename(sourcePath, outputPath);
}

const outputEntries = await readdir(outputDir);
const unexpectedEntries = outputEntries.filter((entry) => !expectedArtifacts.includes(entry));

if (unexpectedEntries.length > 0) {
    throw new Error(`Unexpected release output entries: ${unexpectedEntries.join(', ')}`);
}

console.log(`Created release ZIPs in ${path.relative(root, outputDir)}`);
