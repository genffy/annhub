/**
 * Playwright global teardown — stop the test server.
 */
export default async function globalTeardown() {
    const server = (globalThis as any).__TEST_SERVER__
    if (server) {
        await new Promise<void>((resolve) => {
            server.close(() => {
                console.log('[E2E Teardown] Test server stopped.')
                resolve()
            })
        })
    }
}
