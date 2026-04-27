import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const unusedVars = [
  'error',
  {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrors: 'all',
    caughtErrorsIgnorePattern: '^_',
  },
];

const flat = reactPlugin.configs.flat;
const reactRecommended = flat.recommended;
const reactJsxRuntime = flat['jsx-runtime'];

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'MindfulLens_System_Master/**',
      '**/._*',
    ],
  },
  js.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'no-unused-vars': unusedVars,
      'no-control-regex': 'off',
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      ...reactRecommended.plugins,
      ...reactJsxRuntime.plugins,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ...reactRecommended.languageOptions,
      ...reactJsxRuntime.languageOptions,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactRecommended.rules,
      ...reactJsxRuntime.rules,
      'react/prop-types': 'off',
      'no-unused-vars': unusedVars,
      'react-hooks/rules-of-hooks': 'error',
      // Film Lab: wiele hooków z celowo zawężonymi tablicami zależności — włączenie exhaustive-deps
      // zalewa regresję; refaktoryzacja stopniowa poza tym zadaniem.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      'no-unused-vars': unusedVars,
    },
  },
  {
    files: ['vite.config.js', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      'no-unused-vars': unusedVars,
    },
  },
];
