import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function projectPath(...segments: readonly string[]): string {
    return resolve(process.cwd(), ...segments);
}

export function fixturePath(...segments: readonly string[]): string {
    return projectPath('tests', 'fixtures', ...segments);
}

export function readTextFixture(...segments: readonly string[]): string {
    return readFileSync(fixturePath(...segments), 'utf8');
}

export function readJsonFixture<T>(...segments: readonly string[]): T {
    return JSON.parse(readTextFixture(...segments)) as T;
}
