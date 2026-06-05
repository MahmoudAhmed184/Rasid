import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, '.output');
const requestedVersion = normalizeVersion(process.argv[2] ?? packageJson.version);
const version = packageJson.version;
const expectedArtifacts = [
    `frelancia-v${version}-chrome-mv3.zip`,
    `frelancia-v${version}-firefox-mv3.zip`,
    `frelancia-v${version}-firefox-sources.zip`,
];

function normalizeVersion(value) {
    return value.startsWith('v') ? value.slice(1) : value;
}

function readJson(relativePath) {
    const fullPath = path.join(root, relativePath);

    if (!existsSync(fullPath)) {
        throw new Error(`Required file is missing: ${relativePath}`);
    }

    return JSON.parse(readFileSync(fullPath, 'utf8'));
}

function git(args) {
    const result = spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
    });

    if (result.status !== 0) {
        return null;
    }

    return result.stdout.trim();
}

function commandOutput(command, args) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
    });

    return result.status === 0 ? result.stdout.trim() : null;
}

async function sha256(filePath) {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    for await (const chunk of stream) {
        hash.update(chunk);
    }

    return hash.digest('hex');
}

if (requestedVersion !== version) {
    throw new Error(
        `Requested release version ${requestedVersion} does not match package.json version ${version}`
    );
}

if (!existsSync(outputDir)) {
    throw new Error('Release output directory is missing. Run npm run release:zip first.');
}

const outputEntries = await readdir(outputDir);
const missingArtifacts = expectedArtifacts.filter((artifact) => !outputEntries.includes(artifact));

if (missingArtifacts.length > 0) {
    throw new Error(`Missing release artifacts: ${missingArtifacts.join(', ')}`);
}

const unexpectedZipArtifacts = outputEntries.filter(
    (entry) => entry.endsWith('.zip') && !expectedArtifacts.includes(entry)
);

if (unexpectedZipArtifacts.length > 0) {
    throw new Error(`Unexpected release ZIP artifacts: ${unexpectedZipArtifacts.join(', ')}`);
}

const chromeManifest = readJson('dist/chrome-mv3/manifest.json');
const firefoxManifest = readJson('dist/firefox-mv3/manifest.json');

for (const [browser, manifest] of [
    ['chrome', chromeManifest],
    ['firefox', firefoxManifest],
]) {
    if (manifest.version !== version) {
        throw new Error(
            `${browser} generated manifest version ${manifest.version} does not match ${version}`
        );
    }
}

const artifacts = await Promise.all(
    expectedArtifacts.map(async (file) => {
        const filePath = path.join(outputDir, file);
        const fileStat = await stat(filePath);

        return {
            file,
            bytes: fileStat.size,
            sha256: await sha256(filePath),
        };
    })
);
const checksumText = `${artifacts
    .map((artifact) => `${artifact.sha256}  ${artifact.file}`)
    .join('\n')}\n`;

await writeFile(path.join(outputDir, 'SHA256SUMS.txt'), checksumText, 'utf8');

const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    release: {
        name: 'Frelancia',
        tag: `v${version}`,
        githubOnly: true,
        browserStoreSubmission: false,
    },
    package: {
        name: packageJson.name,
        version,
        private: packageJson.private === true,
        nodeEngine: packageJson.engines?.node ?? null,
    },
    git: {
        commit: git(['rev-parse', 'HEAD']),
        branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
        dirty: (git(['status', '--porcelain']) ?? '').length > 0,
    },
    tooling: {
        node: process.version,
        npm: commandOutput('npm', ['--version']),
        wxt: packageJson.devDependencies?.wxt ?? null,
        webExt: packageJson.devDependencies?.['web-ext'] ?? null,
    },
    artifacts,
    manifests: {
        chrome: {
            path: 'dist/chrome-mv3/manifest.json',
            manifestVersion: chromeManifest.manifest_version,
            version: chromeManifest.version,
            minimumChromeVersion: chromeManifest.minimum_chrome_version,
        },
        firefox: {
            path: 'dist/firefox-mv3/manifest.json',
            manifestVersion: firefoxManifest.manifest_version,
            version: firefoxManifest.version,
            browserSpecificSettings: firefoxManifest.browser_specific_settings,
        },
    },
    validationCommands: [
        'npm run format:check',
        'npm run lint',
        'npm test',
        'npm run build',
        'npm run lint:firefox',
        'npm run test:e2e:chrome',
        'npm run test:e2e:firefox',
    ],
};

await writeFile(
    path.join(outputDir, 'release-evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8'
);

console.log('Wrote .output/SHA256SUMS.txt and .output/release-evidence.json');
