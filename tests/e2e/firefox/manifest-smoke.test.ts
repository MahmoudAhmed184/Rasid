import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Firefox release smoke', () => {
    it('validates the generated Firefox manifest when the build output exists', () => {
        const manifestPath = 'dist/firefox-mv3/manifest.json';

        if (!existsSync(manifestPath)) {
            expect
                .soft(true, 'Firefox manifest smoke is skipped until npm run build:firefox runs.')
                .toBe(true);
            return;
        }

        const manifestText = readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestText) as Record<string, unknown>;

        expect(manifest.manifest_version).toBe(3);
        expect(manifest.browser_specific_settings).toBeDefined();
    });
});
