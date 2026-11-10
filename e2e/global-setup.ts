import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { staleBuildInput } from '../scripts/build-freshness'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Playwright global setup — makes sure the E2E run tests this source tree, not the previous
 * build (RV-TEST-09). It builds when there is no build yet, when BUILD_FORCE=1 is set, or when
 * an input of `wxt build` is newer than the built manifest; the decision itself lives in
 * scripts/build-freshness.mjs, where the unit tests pin its four situations.
 */
export default async function globalSetup() {
  const root = path.join(__dirname, '..')
  const manifest = path.join(root, '.output', 'chrome-mv3', 'manifest.json')
  const trigger = process.env.BUILD_FORCE === '1' ? 'BUILD_FORCE=1' : staleBuildInput(root, manifest)

  if (trigger !== null) {
    console.log(`[E2E Setup] Building extension (${trigger})...`)
    execSync('pnpm run build', {
      cwd: root,
      stdio: 'inherit',
    })
    console.log('[E2E Setup] Extension built successfully.')
  } else {
    console.log('[E2E Setup] Using existing build at .output/chrome-mv3')
  }
}
