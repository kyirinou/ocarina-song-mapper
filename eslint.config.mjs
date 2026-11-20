import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'site-dist/**', 'playwright-report/**', 'test-results/**']
  },
  {
    files: ['lib/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'playwright.config.cjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.node }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
      'eqeqeq': ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  {
    files: ['tests/browser/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  }
];
