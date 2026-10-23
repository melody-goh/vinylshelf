// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * CLAUDE.md: every external service is reached only through its gateway module.
 * These rules make that a lint error instead of a convention.
 */
const DISCOGS_GATEWAY_DIR = 'apps/api/src/discogs/**';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/generated/**', '**/migrations/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [DISCOGS_GATEWAY_DIR],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/discogs/http-gateway*', '**/discogs/oauth1*', '**/discogs/rate-limiter*'],
              message:
                'Discogs is reached only through the DiscogsGateway interface (discogs/gateway.ts).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/api\\.discogs\\.com/]',
          message: 'Discogs URLs belong in the Discogs gateway only.',
        },
        {
          selector: 'TemplateElement[value.raw=/api\\.discogs\\.com/]',
          message: 'Discogs URLs belong in the Discogs gateway only.',
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['**/*.js', '**/*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
