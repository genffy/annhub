// Why the E2E run would test a stale build: an input of `wxt build` newer than the built
// manifest. Exported for the unit tests and for e2e/global-setup.ts (RV-TEST-09); this module
// only reads the tree, it never builds.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const BUILD_INPUT_DIRECTORIES = ['entrypoints', 'background-service', 'core', 'utils', 'types', 'styles', 'locales', 'public', 'assets']

export const BUILD_INPUT_FILES = ['constants.ts', 'wxt.config.ts', 'package.json', 'pnpm-lock.yaml']

/** Tests are not build inputs: touching them must not trigger a rebuild. */
const TEST_ARTIFACT = /(^|\/)__tests__(\/|$)|\.test\./

/** Every file `wxt build` reads, as root-relative paths; missing directories and files are skipped. */
export function listBuildInputs(root: string): string[] {
  const inputs: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(relative)
      else if (!TEST_ARTIFACT.test(relative)) inputs.push(relative)
    }
  }
  for (const directory of BUILD_INPUT_DIRECTORIES) if (existsSync(join(root, directory))) walk(directory)
  for (const file of BUILD_INPUT_FILES) if (existsSync(join(root, file))) inputs.push(file)
  // tsconfig*.json covers tsconfig.json, tsconfig.worker.json and any future variant.
  for (const entry of readdirSync(root)) if (/^tsconfig.*\.json$/.test(entry)) inputs.push(entry)
  return inputs
}

/**
 * What makes the build out of date: the newest input newer than the built manifest, a note that
 * there is no build yet, or null when the build is fresh. The returned string is printed as the
 * rebuild reason.
 */
export function staleBuildInput(root: string, manifestPath: string): string | null {
  if (!existsSync(manifestPath)) return 'no build at .output/chrome-mv3 yet'
  const builtAt = statSync(manifestPath).mtimeMs
  let trigger: string | null = null
  let newest = builtAt
  for (const relative of listBuildInputs(root)) {
    const modifiedAt = statSync(join(root, relative)).mtimeMs
    if (modifiedAt > newest) {
      newest = modifiedAt
      trigger = relative
    }
  }
  return trigger
}
