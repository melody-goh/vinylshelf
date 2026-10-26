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
const GATEWAYS = {
  discogs: {
    dir: 'apps/api/src/discogs/**',
    privateModules: ['**/discogs/http-gateway*', '**/discogs/oauth1*'],
    host: 'api\\.discogs\\.com',
    message: 'Discogs is reached only through the DiscogsGateway interface (discogs/gateway.ts).',
  },
  itunes: {
    dir: 'apps/api/src/itunes/**',
    privateModules: ['**/itunes/http-gateway*'],
    // The API host only: preview audio is served from Apple's CDN hosts, which clients
    // and fixtures legitimately name.
    host: '\\/\\/itunes\\.apple\\.com',
    message: 'iTunes is reached only through the ITunesGateway interface (itunes/gateway.ts).',
  },
};

/**
 * The restrictions for every gateway in `services`. Flat config replaces a rule's
 * options rather than merging them, so each file gets one combined rule: all gateways
 * except the one it belongs to.
 */
function gatewayRules(services) {
  return {
    'no-restricted-imports': [
      'error',
      { patterns: services.map((g) => ({ group: g.privateModules, message: g.message })) },
    ],
    'no-restricted-syntax': [
      'error',
      ...services.flatMap((g) => [
        { selector: `Literal[value=/${g.host}/]`, message: g.message },
        { selector: `TemplateElement[value.raw=/${g.host}/]`, message: g.message },
      ]),
    ],
  };
}

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
    ignores: [GATEWAYS.discogs.dir, GATEWAYS.itunes.dir],
    rules: gatewayRules([GATEWAYS.discogs, GATEWAYS.itunes]),
  },
  { files: [GATEWAYS.discogs.dir], rules: gatewayRules([GATEWAYS.itunes]) },
  { files: [GATEWAYS.itunes.dir], rules: gatewayRules([GATEWAYS.discogs]) },
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
