import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.output', 'e2e', 'website', '.claude', '.wxt'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // next-intl's ESM imports `next/server` without an extension, which only a bundler resolves. Let Vite process it,
    // so the website tests can run the site's proxy as deployed (utils/__tests__/website-*.test.ts).
    server: { deps: { inline: ['next-intl'] } },
    coverage: {
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
