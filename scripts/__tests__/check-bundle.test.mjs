import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundleBudgetProblems } from '../check-bundle.mjs'

/**
 * scripts/check-bundle.mjs keeps the built scripts within byte ceilings (RV-TEST-10, RV-TEST-14).
 * The cases build small fake output directories; `sizeOf` is injected so the ceilings can stay
 * untouched. Every script, stylesheet and page the build ships must have a ceiling: one added
 * without it fails the check naming the file.
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
    writeFileSync(path, size)
  }
  return directory
}

const MANIFEST = {
  content_scripts: [{ js: ['content-scripts/content.js'], css: ['content-scripts/content.css'] }],
  background: { service_worker: 'background.js' },
}
const FILE_BUDGETS = { 'content-scripts/content.js': 500, 'content-scripts/content.css': 500, 'background.js': 500 }
const POPUP_PAGE = { 'popup.html': '<script type="module" crossorigin src="/chunks/popup.js"></script><link rel="modulepreload" crossorigin href="/chunks/shared.js">' }

describe('bundle budgets (RV-TEST-10, RV-TEST-14)', () => {
  it('passes when every bundle fits and names the sizes', () => {
    const directory = withBundles({
      'manifest.json': JSON.stringify(MANIFEST),
      'content-scripts/content.js': 'x',
      'content-scripts/content.css': 'x',
      'background.js': 'x',
    })
    expect(bundleBudgetProblems(directory, { 'content-scripts/content.js': 5000, 'content-scripts/content.css': 5000, 'background.js': 5000 }, () => 1000)).toEqual([])
  })

  it('names the bundle that went over its ceiling', () => {
    const directory = withBundles({ 'manifest.json': JSON.stringify({ background: { service_worker: 'background.js' } }), 'background.js': 'x' })
    expect(bundleBudgetProblems(directory, { 'background.js': 500 }, () => 600)).toEqual(['background.js: 600 bytes over the 500-byte ceiling'])
  })

  it('says which bundle is missing from an existing build', () => {
    const directory = withBundles({ 'manifest.json': JSON.stringify(MANIFEST), 'content-scripts/content.js': 'x' })
    expect(bundleBudgetProblems(directory, FILE_BUDGETS, () => 0)).toEqual(['content-scripts/content.css: missing from the build', 'background.js: missing from the build'])
  })

  it('asks for a build when the output directory does not exist', () => {
    const directory = join(outputDir(), '.output', 'chrome-mv3')
    expect(bundleBudgetProblems(directory)).toEqual(['no build at .output/chrome-mv3: run pnpm run build first'])
  })

  it('fails when the manifest itself is missing', () => {
    const directory = withBundles({ 'background.js': 'x' })
    expect(bundleBudgetProblems(directory, { 'background.js': 500 }, () => 10)).toEqual(['manifest.json: missing from the build'])
  })

  it('sums the files a page loads on first screen against the page ceiling', () => {
    const directory = withBundles({
      'manifest.json': JSON.stringify({}),
      ...POPUP_PAGE,
      'chunks/popup.js': 'x'.repeat(600),
      'chunks/shared.js': 'x'.repeat(300),
    })
    expect(bundleBudgetProblems(directory, { 'popup.html': 1000 })).toEqual([])
    expect(bundleBudgetProblems(directory, { 'popup.html': 899 })).toEqual([
      'popup.html: first screen loads 900 bytes over the 899-byte ceiling (chunks/popup.js, chunks/shared.js)',
    ])
  })

  it('names a first-screen file the build does not ship', () => {
    const directory = withBundles({ 'manifest.json': JSON.stringify({}), 'popup.html': '<script type="module" src="/chunks/popup.js"></script>' })
    expect(bundleBudgetProblems(directory, { 'popup.html': 1000 }, () => 1)).toEqual(["chunks/popup.js: named by popup.html's first screen but missing from the build"])
  })

  it('budgets a static page at zero and fails when it grows a script', () => {
    const staticPage = { 'manifest.json': JSON.stringify({}), 'static.html': '<p>no scripts here</p>' }
    expect(bundleBudgetProblems(withBundles(staticPage), { 'static.html': 0 })).toEqual([])
    const grown = { ...staticPage, 'static.html': '<script src="/static.js"></script>', 'static.js': 'x'.repeat(10) }
    expect(bundleBudgetProblems(withBundles(grown), { 'static.html': 0 })).toEqual(['static.html: first screen loads 10 bytes over the 0-byte ceiling (static.js)'])
  })

  it('fails when a manifest script or stylesheet has no ceiling (RV-TEST-14)', () => {
    const directory = withBundles({
      'manifest.json': JSON.stringify(MANIFEST),
      'content-scripts/content.js': 'x'.repeat(10),
      'content-scripts/content.css': 'x'.repeat(10),
      'background.js': 'x'.repeat(10),
    })
    expect(bundleBudgetProblems(directory, { 'content-scripts/content.js': 100, 'background.js': 100 }, () => 10)).toEqual([
      'content-scripts/content.css: the manifest ships it without a ceiling — add it to BUNDLE_BUDGETS',
    ])
  })

  it('fails when a built page has no ceiling (RV-TEST-14)', () => {
    const directory = withBundles({
      'manifest.json': JSON.stringify(MANIFEST),
      'content-scripts/content.js': 'x'.repeat(10),
      'content-scripts/content.css': 'x'.repeat(10),
      'background.js': 'x'.repeat(10),
      ...POPUP_PAGE,
      'chunks/popup.js': 'x'.repeat(10),
      'chunks/shared.js': 'x'.repeat(10),
      'library.html': '<script type="module" src="/chunks/library.js"></script>',
    })
    expect(bundleBudgetProblems(directory, { ...FILE_BUDGETS, 'popup.html': 1000 }, () => 10)).toEqual(['library.html: a built page without a ceiling — add it to BUNDLE_BUDGETS'])
  })

  it('says the manifest cannot be read when it is broken', () => {
    const directory = withBundles({ 'manifest.json': '{not json', ...POPUP_PAGE, 'chunks/popup.js': 'x', 'chunks/shared.js': 'x' })
    const problems = bundleBudgetProblems(directory, { 'popup.html': 1000 }, () => 1)
    expect(problems).toContain('manifest.json: cannot be parsed')
  })
})
