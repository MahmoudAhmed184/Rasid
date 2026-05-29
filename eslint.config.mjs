import js from '@eslint/js';
import { defineConfig, globalIgnores, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url));

export default defineConfig(
    includeIgnoreFile(gitignorePath, {
        gitignoreResolution: true,
        name: 'Imported .gitignore patterns',
    }),
    globalIgnores(['**/vendor/**', '**/*.min.js', 'package-lock.json'], 'Rasid lint-only ignores'),
    {
        name: 'Rasid linter options',
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
            reportUnusedInlineConfigs: 'error',
        },
    },
    {
        name: 'Rasid JavaScript',
        files: ['**/*.{js,mjs,cjs}'],
        extends: [js.configs.recommended],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node,
        },
        rules: {
            curly: ['error', 'all'],
        },
    },
    {
        name: 'Rasid CommonJS',
        files: ['**/*.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
        },
    },
    {
        name: 'Rasid TypeScript',
        files: ['**/*.ts'],
        extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.serviceworker,
                ...globals.vitest,
                ...globals.webextensions,
            },
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['playwright.config.ts', 'vitest.config.ts'],
                    defaultProject: 'tests/tsconfig.json',
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            curly: ['error', 'all'],
            'no-undef': 'off',
            '@typescript-eslint/require-await': 'off',
        },
    },
    {
        name: 'Rasid TypeScript tests',
        files: ['tests/**/*.ts'],
        extends: [tseslint.configs.disableTypeChecked],
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                },
            ],
        },
    }
);
