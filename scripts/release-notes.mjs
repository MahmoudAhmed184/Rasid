import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const version = normalizeVersion(process.argv[2] ?? '');
const outputPath = process.argv[3] ? path.resolve(root, process.argv[3]) : null;

function normalizeVersion(value) {
    return value.startsWith('v') ? value.slice(1) : value;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (!version || !outputPath) {
    throw new Error('Usage: npm run release:notes -- <version> <output-path>');
}

const changelogPath = path.join(root, 'CHANGELOG.md');

if (!existsSync(changelogPath)) {
    throw new Error('CHANGELOG.md is missing.');
}

const changelog = await readFile(changelogPath, 'utf8');
const headingPattern = new RegExp(`^##\\s+v?${escapeRegExp(version)}(?:\\s+-\\s+.+)?\\s*$`);
const lines = changelog.split(/\r?\n/);
const startIndex = lines.findIndex((line) => headingPattern.test(line));

if (startIndex < 0) {
    throw new Error(`Could not find changelog section for v${version}.`);
}

const endIndex = lines.findIndex((line, index) => index > startIndex && /^##\s+/.test(line));
const sectionLines = lines.slice(startIndex, endIndex < 0 ? undefined : endIndex);
const notes = `${sectionLines.join('\n').trim()}\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, notes, 'utf8');

console.log(`Wrote release notes for v${version} to ${path.relative(root, outputPath)}`);
