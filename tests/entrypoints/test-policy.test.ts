import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { projectPath } from '../support/fixtures';

const TEST_NETWORK_FORBIDDEN_PATTERNS = [
    /fetch\(\s*['"`]https:\/\/(?:api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com)/,
    /fetch\(\s*['"`]https:\/\/(?:mostaql\.com|khamsat\.com|nafezly\.com)/,
    /new\s+WebSocket\(/,
    /HubConnectionBuilder\(/,
] as const;

function readTestSources(directory: string): string {
    return readdirSync(directory)
        .flatMap((entry) => {
            const path = join(directory, entry);
            const stat = statSync(path);

            if (stat.isDirectory()) {
                return readTestSources(path);
            }

            return path.endsWith('.ts') || path.endsWith('.mjs') ? readFileSync(path, 'utf8') : '';
        })
        .join('\n');
}

describe('test-suite policy guards', () => {
    it('does not contain direct live marketplace, AI provider, ChatGPT, or SignalR calls', () => {
        const result = readTestSources(projectPath('tests'));

        for (const pattern of TEST_NETWORK_FORBIDDEN_PATTERNS) {
            expect(result).not.toMatch(pattern);
        }
    });
});
