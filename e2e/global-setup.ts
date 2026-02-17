import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Playwright global setup — builds the extension before all tests.
 * Only rebuilds if the output directory is missing or BUILD_FORCE is set.
 */
export default async function globalSetup() {
    const outputDir = path.join(__dirname, '..', '.output', 'chrome-mv3')
    const shouldBuild = !fs.existsSync(outputDir) || process.env.BUILD_FORCE === '1'

    if (shouldBuild) {
        console.log('[E2E Setup] Building extension...')
        execSync('npm run build', {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit',
        })
        console.log('[E2E Setup] Extension built successfully.')
    } else {
        console.log('[E2E Setup] Using existing build at .output/chrome-mv3')
    }
}
