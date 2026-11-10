// ESLint flat config. Prettier owns formatting, so only correctness rules live here.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      '.claude/worktrees/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'website/**',
      'docs/**',
      'scripts/data/**',
    ],
  },
  {
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      // `verbatimModuleSyntax` (WXT default) requires type-only imports to be marked.
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports', disallowTypeAnnotations: false }],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  {
    // Rules that read types. A promise nobody awaits is how an MV3 service worker loses work: the browser stops
    // the worker once its listeners have returned, whatever is still pending. `void` marks the ones left on purpose.
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },
  // Dependency direction: `core/` depends on nothing of ours, `types/` and `utils/` only on what is below them,
  // the service worker never on an entry point, and an entry point never on the worker's services or on another
  // entry point. Tests are free to reach for fixtures. What an import may not say is a relative path that leaves
  // the layer, so the patterns are anchored on the `../` steps a file at that depth needs to get out.
  ...[
    { files: ['core/*.ts'], leaves: '^\\.\\./', layer: 'core/ imports nothing outside core/' },
    { files: ['core/*/**/*.ts'], leaves: '^\\.\\./\\.\\./', layer: 'core/ imports nothing outside core/' },
    { files: ['types/*.ts'], leaves: '^\\.\\./(?!core/)', layer: 'types/ imports core/ only' },
    { files: ['utils/*.{ts,tsx}'], leaves: '^\\.\\./(?!core/|types/)', layer: 'utils/ imports core/ and types/ only' },
    { files: ['utils/*/**/*.{ts,tsx}'], leaves: '^\\.\\./\\.\\./(?!core/|types/)', layer: 'utils/ imports core/ and types/ only' },
    { files: ['background-service/**/*.ts'], leaves: '^(\\.\\./)+entrypoints/', layer: 'the service worker imports no entry point' },
    {
      files: ['entrypoints/{content,library,offscreen,options,popup}/**/*.{ts,tsx}'],
      leaves: '^(\\.\\./)+(background-service|entrypoints|background|content|library|offscreen|options|popup)/',
      layer: 'an entry point imports neither the service worker nor another entry point; what two of them share lives in core/ or utils/',
    },
  ].map(({ files, leaves, layer }) => ({
    files,
    ignores: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ regex: leaves, message: `Dependency direction: ${layer}.` }] }] },
  })),
  {
    // Hooks rules only make sense for React code (Playwright fixtures also name a callback `use`).
    files: ['entrypoints/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['**/__tests__/**', 'e2e/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}', 'scripts/**', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
)
