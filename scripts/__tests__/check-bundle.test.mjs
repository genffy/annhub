import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundleBudgetProblems } from '../check-bundle.mjs'

/**
 * scripts/check-bundle.mjs keeps the built scripts within byte ceilings (RV-TEST-10). The cases
 * build small fake output directories; `sizeOf` is injected so the ceilings can stay untouched.
 */

const trees = []
const outputDir = () => {
  const directory = mkdtempSync(join(tmpdir(), 'check-bundle-'))
  trees.push(directory)
  return directory
}

afterEach(() => {
  for (const tree of trees.splice(0)) rmSync(tree, { recursive: true, force: true })
})

const withBundles = sizes => {
  const directory = outputDir()
  for (const [file, size] of Object.entries(sizes)) {
    const path = join(directory, file)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, 'x'.repeat(size))
  }
  return directory
}

describe('bundle budgets (RV-TEST-10)', () => {
  it('passes when every bundle fits and names the sizes', () => {
    const directory = withBundles({ 'content-scripts/content.js': 1000, 'background.js': 1000 })
    expect(bundleBudgetProblems(directory, undefined, () => 1000)).toEqual([])
  })

  it('names the bundle that went over its ceiling', () => {
    const directory = withBundles({ 'content-scripts/content.js': 10, 'background.js': 10 })
    expect(bundleBudgetProblems(directory, { 'content-scripts/content.js': 500, 'background.js': 500 }, path => (path.endsWith('content.js') ? 600 : 400))).toEqual([
      'content-scripts/content.js: 600 bytes over the 500-byte ceiling',
    ])
  })

  it('says which bundle is missing from an existing build', () => {
    const directory = withBundles({ 'content-scripts/content.js': 10 })
    expect(bundleBudgetProblems(directory, undefined, () => 0)).toEqual(['background.js: missing from the build'])
  })

  it('asks for a build when the output directory does not exist', () => {
    const directory = join(outputDir(), '.output', 'chrome-mv3')
    expect(bundleBudgetProblems(directory)).toEqual(['no build at .output/chrome-mv3: run pnpm run build first'])
  })
})
