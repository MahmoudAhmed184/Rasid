import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const MANIFESTS_DIR = path.join(ROOT_DIR, 'manifests');
const JSON_INDENT = 4;

const TARGETS = new Set(['chrome', 'firefox']);
const TARGET_EXCLUDED_PATHS = {
    chrome: new Set(),
    firefox: new Set(['bg/offscreen.js', 'offscreen.html', 'offscreen.js']),
};
const EXCLUDED_NAMES = new Set(['.git', '.github', 'dist', 'manifests', 'node_modules', 'scripts']);
const EXCLUDED_FILES = new Set(['manifest.json', 'package-lock.json', 'package.json']);

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--clean')) {
        await cleanDist();
        console.log('Cleaned dist/');
        return;
    }

    const requestedTargets = args.filter((arg) => TARGETS.has(arg));
    const targets = requestedTargets.length > 0 ? requestedTargets : [...TARGETS];

    await cleanDist();

    for (const target of targets) {
        await buildTarget(target);
    }

    await syncWorkspaceManifest();

    console.log(`Built targets: ${targets.join(', ')}`);
}

async function buildTarget(target) {
    const outputDir = path.join(DIST_DIR, target);
    await mkdir(outputDir, { recursive: true });
    await copyWorkspace(ROOT_DIR, outputDir, target);

    const baseManifest = await readJson(path.join(MANIFESTS_DIR, 'base.json'));
    const targetManifest = await readJson(path.join(MANIFESTS_DIR, `${target}.json`));
    const manifest = mergeManifest(baseManifest, targetManifest);

    await writeFile(
        path.join(outputDir, 'manifest.json'),
        `${JSON.stringify(manifest, null, JSON_INDENT)}\n`,
        'utf8'
    );
}

async function syncWorkspaceManifest() {
    const baseManifest = await readJson(path.join(MANIFESTS_DIR, 'base.json'));
    const chromeManifest = await readJson(path.join(MANIFESTS_DIR, 'chrome.json'));
    const manifest = mergeManifest(baseManifest, chromeManifest);

    await writeFile(
        path.join(ROOT_DIR, 'manifest.json'),
        `${JSON.stringify(manifest, null, JSON_INDENT)}\n`,
        'utf8'
    );
}

async function cleanDist() {
    await rm(DIST_DIR, { recursive: true, force: true });
}

async function copyWorkspace(sourceDir, targetDir, target) {
    const entries = await readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
        if (EXCLUDED_NAMES.has(entry.name)) {
            continue;
        }

        if (entry.isFile() && EXCLUDED_FILES.has(entry.name)) {
            continue;
        }

        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        const relativePath = path.relative(ROOT_DIR, sourcePath).split(path.sep).join('/');

        if (TARGET_EXCLUDED_PATHS[target] && TARGET_EXCLUDED_PATHS[target].has(relativePath)) {
            continue;
        }

        if (entry.isDirectory()) {
            await mkdir(targetPath, { recursive: true });
            await copyWorkspace(sourcePath, targetPath, target);
            continue;
        }

        const fileStat = await stat(sourcePath);
        if (!fileStat.isFile()) {
            continue;
        }

        await cp(sourcePath, targetPath);
    }
}

async function readJson(filePath) {
    const contents = await readFile(filePath, 'utf8');
    return JSON.parse(contents);
}

function mergeManifest(base, override) {
    if (Array.isArray(base) || Array.isArray(override)) {
        return cloneValue(override);
    }

    const result = { ...base };

    for (const [key, overrideValue] of Object.entries(override)) {
        const baseValue = result[key];

        if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
            result[key] = mergeManifest(baseValue, overrideValue);
        } else {
            result[key] = cloneValue(overrideValue);
        }
    }

    return result;
}

function cloneValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => cloneValue(item));
    }

    if (isPlainObject(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)])
        );
    }

    return value;
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

main().catch((error) => {
    console.error('Build failed:', error);
    process.exitCode = 1;
});
