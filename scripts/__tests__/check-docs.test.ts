import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * scripts/check-docs.mjs keeps the documentation honest: links resolve, § references name a section that exists,
 * and cited identifiers are defined somewhere. Each case below builds a small tree in which everything agrees,
 * breaks exactly one place, and expects the script to name it: an assertion that cannot fail protects nothing.
 *
 * The ids and section references are built through `id()`/`ref()` so that this file itself never cites one: the
 * checker scans every source file, and a literal id here would have to be defined in the real documentation.
 */

const script = resolve(__dirname, '../check-docs.mjs')

const id = (family: string, n: number) => `${family}-${n}`
const ref = (doc: string, section: string) => `${doc} §${section}`

const SPEC = 'spec.md'
const Q1 = id('Q', 1)
const Q2 = id('Q', 2)

const GOOD_FILES: Record<string, string> = {
  'README.md': '# AnnHub\n\nSee the [guide](docs/guide.md).\n',
  'docs/guide.md': `# Guide\n\n## 1. Basics\n\nThe toolbar follows ${ref(SPEC, '1.1')}, and ${Q2} decides the window size.\n`,
  'docs/spec.md': '# Spec\n\n## 1.1 Toolbar\n\nThe toolbar pins the selection.\n',
  'docs/decisions.md': `# Decisions

## ${Q1} Window sizing

The window keeps its size on reopen.

| ID  | Decision                                |
| --- | --------------------------------------- |
| ${Q2} | The window reopens at its previous size |
`,
  'entrypoints/toolbar.ts': `// The toolbar keeps the selection (${ref(SPEC, '1.1')}).\nexport const toolbar = "pins"\n`,
  'e2e/toolbar.spec.ts': `import { test, expect } from '@playwright/test'

test('the window keeps its size (${Q1})', async () => {
  expect('pins').toBe('pins')
})
`,
}

const directories: string[] = []
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

/** Runs the script on the good tree with some files replaced (a string) or removed (null). */
function check(overrides: Record<string, string | null> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-docs-'))
  directories.push(root)
  for (const [file, content] of Object.entries({ ...GOOD_FILES, ...overrides })) {
    if (content === null) continue
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  const result = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

/** The good file with one edit; fails loudly when the text to replace is gone, so a case cannot pass by editing nothing. */
function edit(file: string, from: string, to: string): string {
  const text = GOOD_FILES[file]!
  if (!text.includes(from)) throw new Error(`${file} no longer contains ${from}`)
  return text.replace(from, to)
}

describe('check-docs', () => {
  it('passes on a tree where every link, section reference and identifier resolves', () => {
    const { status, output } = check()
    expect(status).toBe(0)
    expect(output).toContain('link:')
    expect(output).toContain('section-ref:')
    expect(output).toContain('retired-id:')
  })

  it('names the file and line of a relative link whose target is missing', () => {
    const { status, output } = check({ 'README.md': edit('README.md', 'docs/guide.md', 'docs/missing.md') })
    expect(status).toBe(1)
    expect(output).toContain('README.md:3: [link] missing target docs/missing.md')
  })

  it('names the file and line of a #anchor without a heading', () => {
    const { status, output } = check({ 'README.md': edit('README.md', 'guide.md', 'guide.md#nope') })
    expect(status).toBe(1)
    expect(output).toContain('README.md:3: [link] no heading for #nope in docs/guide.md')
  })

  it('names the document and section of a § reference in Markdown that points nowhere', () => {
    const broken = ref(SPEC, '9.9')
    const { status, output } = check({ 'docs/guide.md': edit('docs/guide.md', ref(SPEC, '1.1'), broken) })
    expect(status).toBe(1)
    expect(output).toContain(`docs/guide.md:5: [section-ref] docs/${broken} does not exist`)
  })

  it('checks § references cited from source files too', () => {
    const broken = ref(SPEC, '9.9')
    const { status, output } = check({
      'entrypoints/toolbar.ts': edit('entrypoints/toolbar.ts', ref(SPEC, '1.1'), broken),
    })
    expect(status).toBe(1)
    expect(output).toContain(`entrypoints/toolbar.ts:1: [section-ref] docs/${broken} does not exist`)
  })

  it('names a Markdown file whose file name carries a date', () => {
    const { status, output } = check({ 'docs/report-2026-10-11.md': '# Report\n' })
    expect(status).toBe(1)
    expect(output).toContain('docs/report-2026-10-11.md: [dated-file] the file name contains a date')
  })

  it('names the citing place of an identifier whose definition is gone', () => {
    const { status, output } = check({ 'docs/decisions.md': edit('docs/decisions.md', `## ${Q1} Window sizing`, '## Window sizing') })
    expect(status).toBe(1)
    expect(output).toContain(`e2e/toolbar.spec.ts:3: [retired-id] ${Q1} is cited but not defined in any Markdown`)
  })
})
