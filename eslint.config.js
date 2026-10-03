/**
 * ESLint configuration (`npm run lint`).
 * Server code, scripts and tests are CommonJS on Node; files in public/js are
 * classic browser scripts that share a few globals (Willow, WillowCharts…).
 */
'use strict';

const js = require('@eslint/js');
const globals = require('globals');

const shared = {
    'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    'no-var': 'error',
    'prefer-const': ['error', { destructuring: 'all' }],
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'no-implicit-globals': 'error',
    'no-shadow': ['error', { builtinGlobals: false, hoist: 'functions' }],
    'no-throw-literal': 'error',
    'no-return-assign': ['error', 'except-parens'],
    'no-useless-concat': 'error',
    'object-shorthand': ['error', 'properties'],
    curly: ['error', 'multi-line'],
    'no-control-regex': 'off', // input validation deliberately rejects control characters
};

module.exports = [
    { ignores: ['node_modules/**', 'data/**', 'coverage/**', 'market-data-service/**'] },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        ignores: ['public/js/**'],
        languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
        rules: shared,
    },
    {
        // In tests, `before` and `after` are natural names for snapshots of state.
        files: ['tests/**/*.js'],
        rules: { 'no-shadow': ['error', { builtinGlobals: false, hoist: 'functions', allow: ['before', 'after'] }] },
    },
    {
        files: ['public/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: { ...globals.browser, Willow: 'readonly', WillowCharts: 'readonly', WillowWealth: 'readonly', WillowAuth: 'readonly' },
        },
        rules: shared,
    },
];
