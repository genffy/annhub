import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['**/*.test.ts'],
        exclude: ['node_modules', '.output', 'e2e', 'website'],
        globals: true,
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
