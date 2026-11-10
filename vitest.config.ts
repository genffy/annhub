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
          include: ['**/*.test.{ts,mjs}'],
          exclude: [...EXCLUDED, ...DOM_ENTRYPOINTS],
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: DOM_ENTRYPOINTS.map(directory => `${directory}/**/*.test.{ts,mjs}`),
          exclude: EXCLUDED,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      reportsDirectory: './coverage',
      include: ['core/**'],
      exclude: ['core/__tests__/**'],
      // Floors of the measured line, branch and function coverage; only ever raised (RV-TEST-08).
      thresholds: { lines: 95, branches: 87, functions: 95 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
