import { defineConfig } from 'vitest/config'
import path from 'path'

// Tests that render or query the DOM live in the three extension entrypoints; everything else
// (core, background-service, utils, offscreen, scripts) runs in node, so a DOM dependency there
// fails instead of passing unnoticed. A single file that needs the DOM declares
// `// @vitest-environment jsdom` at the top; directories are not moved back wholesale.
const DOM_ENTRYPOINTS = ['entrypoints/content', 'entrypoints/library', 'entrypoints/popup']
const EXCLUDED = ['node_modules', '.output', 'e2e', 'website', '.claude', '.wxt']

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.{ts,tsx,mjs}'],
          exclude: [...EXCLUDED, ...DOM_ENTRYPOINTS],
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: DOM_ENTRYPOINTS.map(directory => `${directory}/**/*.test.{ts,tsx,mjs}`),
          exclude: EXCLUDED,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      reportsDirectory: './coverage',
      // Source only: a bare `core/**` pulled `core/AGENTS.md` in as an untested source and
      // made v8 print a PARSE_ERROR on every run (RV-TEST-15).
      include: ['core/**/*.ts', 'background-service/**/*.ts'],
      exclude: ['core/__tests__/**', 'background-service/__tests__/**'],
      // Floors of the measured line, branch and function coverage; only ever raised (RV-TEST-08).
      // background-service is the message facade and sender-verification boundary (RV-TEST-15).
      thresholds: {
        'core/**': { lines: 95, branches: 87, functions: 95 },
        'background-service/**': { lines: 77, branches: 71, functions: 79 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
