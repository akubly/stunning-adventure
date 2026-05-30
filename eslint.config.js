import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['packages/cairn/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@akubly/eureka', '@akubly/eureka/*'],
              message: 'Layering violation: @akubly/eureka depends on @akubly/types; cairn/forge must not depend on eureka. See docs/eureka/sections/40-integration.md.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/forge/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@akubly/eureka', '@akubly/eureka/*'],
              message: 'Layering violation: @akubly/eureka depends on @akubly/types; cairn/forge must not depend on eureka. See docs/eureka/sections/40-integration.md.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['**/dist/', '**/node_modules/', '*.config.*'],
  },
);
