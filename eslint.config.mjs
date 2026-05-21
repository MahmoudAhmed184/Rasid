import { defineConfig } from 'eslint/config';

export default defineConfig([
    {
        ignores: [
            '.wxt/**',
            'dist/**',
            'node_modules/**',
            '**/vendor/**',
            '**/*.min.js',
            'package-lock.json',
        ],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
        },
        rules: {
            curly: ['error', 'all'],
        },
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        rules: {
            curly: ['error', 'all'],
        },
    },
]);
