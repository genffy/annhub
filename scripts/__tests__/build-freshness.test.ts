import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUILD_INPUT_DIRECTORIES, listBuildInputs, staleBuildInput } from '../build-freshness'

/**
 * The E2E global setup rebuilds when an input of `wxt build` is newer than the built manifest
 * (RV-TEST-09); these cases pin the decision on small trees whose mtimes are set explicitly, so
 * the four situations of the acceptance list each have one.
 */

const trees: string[] = []
const tree = () => {
  const root = mkdtempSync(join(tmpdir(), 'build-freshness-'))
  trees.push(root)
  return root
}

afterEach(() => {
  for (const root of trees.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Writes `files` into the tree and sets mtimes: inputs older than the manifest unless named in `newer` (RV-TEST-09). */
const seededTree = (files: Record<string, string>, newer: string[] = [], withBuild = true) => {
  const root = tree()
  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(join(root, relative, '..'), { recursive: true })
    writeFileSync(join(root, relative), content)
  }
  // A fixed clock: the manifest is `built` at noon, `newer` files touched a minute later,
  // everything else a minute earlier. utimesSync is also how the fastest filesystem granularity
  // is kept out of the comparison.
  const manifestPath = join(root, '.output/chrome-mv3/manifest.json')
  const noon = new Date('2026-01-01T12:00:00Z')
  const before = new Date(noon.getTime() - 60_000)
  const after = new Date(noon.getTime() + 60_000)
  for (const relative of Object.keys(files)) utimesSync(join(root, relative), before, before)
  for (const relative of newer) utimesSync(join(root, relative), after, after)
  if (withBuild) {
    mkdirSync(join(root, '.output/chrome-mv3'), { recursive: true })
    writeFileSync(manifestPath, '{}')
    utimesSync(manifestPath, noon, noon)
  }
  return { root, manifestPath }
}

const TREE = {
  'entrypoints/content/index.tsx': 'export {}\n',
  'entrypoints/content/__tests__/x.test.ts': 'export {}\n',
  'core/store.ts': 'export {}\n',
  'wxt.config.ts': 'export default {}\n',
  'tsconfig.json': '{}\n',
  'tsconfig.worker.json': '{}\n',
  'package.json': '{}\n',
}

describe('listBuildInputs (RV-TEST-09)', () => {
  it('covers the input directories, the named files and every tsconfig variant, never tests', () => {
    const { root } = seededTree(TREE)
    const inputs = listBuildInputs(root)
    expect(inputs).toContain('entrypoints/content/index.tsx')
    expect(inputs).toContain('core/store.ts')
    expect(inputs).toContain('wxt.config.ts')
    expect(inputs).toContain('package.json')
    expect(inputs).toContain('tsconfig.json')
    expect(inputs).toContain('tsconfig.worker.json')
    expect(inputs).not.toContain('entrypoints/content/__tests__/x.test.ts')
    expect(BUILD_INPUT_DIRECTORIES).toContain('entrypoints')
  })
})

describe('staleBuildInput (RV-TEST-09)', () => {
  it('names the input that is newer than the build', () => {
    const { root, manifestPath } = seededTree(TREE, ['core/store.ts'])
    expect(staleBuildInput(root, manifestPath)).toBe('core/store.ts')
  })

  it('keeps a build whose inputs are all older', () => {
    const { root, manifestPath } = seededTree(TREE)
    expect(staleBuildInput(root, manifestPath)).toBeNull()
  })

  it('reports a missing build', () => {
    const { root, manifestPath } = seededTree(TREE, [], false)
    expect(staleBuildInput(root, manifestPath)).toBe('no build at .output/chrome-mv3 yet')
  })

  it('ignores a test file newer than the build', () => {
    const { root, manifestPath } = seededTree(TREE, ['entrypoints/content/__tests__/x.test.ts'])
    expect(staleBuildInput(root, manifestPath)).toBeNull()
  })
})
