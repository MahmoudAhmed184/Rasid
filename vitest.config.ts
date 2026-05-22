import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

const wxtPlugins = await WxtVitest();

export default defineConfig({
    plugins: wxtPlugins,
    test: {
        environment: 'node',
        globals: false,
        setupFiles: ['./tests/support/setup-vitest.ts'],
        include: [
            'tests/src/**/*.test.ts',
            'tests/entrypoints/**/*.test.ts',
            'tests/e2e/firefox/**/*.test.ts',
        ],
        exclude: ['dist/**', '.test-dist/**', 'tests/e2e/chrome/**'],
        restoreMocks: true,
        clearMocks: true,
        mockReset: true,
        coverage: {
            provider: 'v8',
            reportsDirectory: 'coverage/vitest',
            reporter: ['text', 'html', 'json-summary'],
            include: ['src/**/*.ts', 'entrypoints/**/*.ts'],
            exclude: [
                '**/*.d.ts',
                '**/*.css',
                'entrypoints/**/main.ts',
                'entrypoints/**/*.content.ts',
                'src/**/*.test.ts',
            ],
        },
    },
});
