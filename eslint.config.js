// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const determinismMessage =
  'The engine must be deterministic: use the seeded generator and the game clock.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/dev-dist/',
      '**/coverage/',
      '**/playwright-report/',
      '**/test-results/',
      'docs/maquettes/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/game/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The engine runs in Node and in the browser: no host globals, no hidden
    // sources of time or randomness.
    files: ['packages/engine/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: determinismMessage },
        { object: 'Date', property: 'now', message: determinismMessage },
        { object: 'performance', property: 'now', message: determinismMessage },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: determinismMessage,
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: determinismMessage,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'react/*', 'pixi.js', 'pixi.js/*', '@pixi/*', 'idb'],
              message: 'The engine must not depend on the interface.',
            },
          ],
        },
      ],
    },
  },
);
