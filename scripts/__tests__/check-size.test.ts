import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * scripts/check-size.mjs keeps files within byte budgets, and the ledger (scripts/size-ledger.json)
 * keeps the files that are already over budget from growing. Each case below builds a small tree in
 * which everything agrees, breaks exactly one place, and expects the script to name it.
 */

const script = resolve(__dirname, '../check-size.mjs')

const CODE_FILE = 'entrypoints/library/App.tsx'
const AGENTS = 'AGENTS.md'

/** A code file of exactly `bytes` bytes (over the 32 KB code budget when bytes says so). */
const codeFile = (bytes: number) => {
  const body = 'x'.repeat(bytes - 22)
  return `export const big = '${body}'\n`
}

const GOOD_FILES: Record<string, string> = {
  [AGENTS]: '# AnnHub\n\nRead the directory AGENTS.md when you touch its code.\n',
  'entrypoints/library/AGENTS.md': '# Library\n\nSee [notes/x.md](notes/x.md) for the list rules.\n',
  'entrypoints/library/notes/x.md': '# Lists\n\nA card grid, fifty per page.\n',
  'docs/guide.md': '# Guide\n\nThe guide is a document.\n',
  [CODE_FILE]: codeFile(24 * 1024),
  'entrypoints/library/style.css': '.card { color: black }\n',
  'docs/design/js/board.js': '// hand-written prototype, no budget\n',
  'package-lock.json': '{ "locked": true }\n',
  'website/public/page.html': '<html></html>\n',
  'scripts/data/table.json': '{ "rows": [] }\n',
}

const ledgerOf = (entries: Record<string, number>) => `${JSON.stringify(entries, null, 2)}\n`
const BIG = 36 * 1024

const directories: string[] = []
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

/** Runs the script on the good tree with some files replaced (a string) or removed (null). */
function check(overrides: Record<string, string | null> = {}, args: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'check-size-'))
  directories.push(root)
  for (const [file, content] of Object.entries({ ...GOOD_FILES, ...overrides })) {
    if (content === null) continue
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  const result = spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' })
  return { root, status: result.status, output: `${result.stdout}${result.stderr}` }
}

/** The good file with one edit; fails loudly when the text to replace is gone. */
function edit(file: string, from: string, to: string): string {
  const text = GOOD_FILES[file]!
  if (!text.includes(from)) throw new Error(`${file} no longer contains ${from}`)
  return text.replace(from, to)
}

describe('check-size', () => {
  it('passes when every budgeted file fits', () => {
    const { status, output } = check()
    expect(status).toBe(0)
    expect(output).toContain('agents: 2 file(s)')
    expect(output).toContain('ledger: 0 entries, 0 KB over budget in total')
  })

  it('names the file that exceeds its budget', () => {
    const { status, output } = check({ [CODE_FILE]: codeFile(BIG) })
    expect(status).toBe(1)
    expect(output).toContain(`${CODE_FILE}: [over-budget]`)
  })

  it('names a file over 2 MB too: the biggest files do not escape the budget', () => {
    const { status, output } = check({ [CODE_FILE]: codeFile(2_100_000) })
    expect(status).toBe(1)
    expect(output).toContain(`${CODE_FILE}: [over-budget]`)
  })

  it('rejects a ledgered file that grew', () => {
    const { status, output } = check({ 'scripts/size-ledger.json': ledgerOf({ [CODE_FILE]: 34 * 1024 }), [CODE_FILE]: codeFile(BIG) })
    expect(status).toBe(1)
    expect(output).toContain(`${CODE_FILE}: [grew]`)
  })

  it('asks to record a ledgered file that shrank by a kilobyte or more', () => {
    const { status, output } = check({ 'scripts/size-ledger.json': ledgerOf({ [CODE_FILE]: 38 * 1024 }), [CODE_FILE]: codeFile(BIG) })
    expect(status).toBe(1)
    expect(output).toContain(`${CODE_FILE}: [shrunk]`)
  })

  it('asks to drop a ledgered file that is back within budget', () => {
    const { status, output } = check({ 'scripts/size-ledger.json': ledgerOf({ [CODE_FILE]: 34 * 1024 }) })
    expect(status).toBe(1)
    expect(output).toContain(`${CODE_FILE}: [settled]`)
  })

  it('names a ledger entry whose file is gone', () => {
    const { status, output } = check({ 'scripts/size-ledger.json': ledgerOf({ 'gone/removed.ts': 33 * 1024 }) })
    expect(status).toBe(1)
    expect(output).toContain('gone/removed.ts: [stale]')
  })

  it('refuses instruction files on the ledger', () => {
    const { status, output } = check({ 'scripts/size-ledger.json': ledgerOf({ [AGENTS]: 9 * 1024 }) })
    expect(status).toBe(1)
    expect(output).toContain(`${AGENTS}: [no-ledger]`)
  })

  it('never reports html, json, lockfiles or docs/design assets', () => {
    const { status } = check({
      'package-lock.json': `{ "locked": "${'x'.repeat(60000)}" }\n`,
      'website/public/page.html': `<p>${'x'.repeat(60000)}</p>\n`,
      'docs/design/js/board.js': `// ${'x'.repeat(60000)}\n`,
      'scripts/data/table.json': `{ "rows": "${'x'.repeat(60000)}" }\n`,
    })
    expect(status).toBe(0)
  })

  it('flags a line over 300 characters in an instruction file', () => {
    const { status, output } = check({ [AGENTS]: edit(AGENTS, 'Read the directory AGENTS.md when you touch its code.', `A very long rule: ${'x'.repeat(290)}.`) })
    expect(status).toBe(1)
    expect(output).toContain('[long-line]')
  })

  it('counts bytes, not characters: 3000 CJK characters are 9000 bytes', () => {
    const { status, output } = check({ [AGENTS]: `# AnnHub\n\n${'设'.repeat(3000)}\n` })
    expect(status).toBe(1)
    expect(output).toContain('AGENTS.md: [over-budget]')
  })

  it('--lower lowers an entry to the current ceiling, never raises, and drops it within budget', () => {
    const lowered = check({ 'scripts/size-ledger.json': ledgerOf({ [CODE_FILE]: 38 * 1024 }), [CODE_FILE]: codeFile(BIG) }, ['--lower'])
    expect(lowered.status).toBe(0)
    expect(JSON.parse(readFileSync(join(lowered.root, 'scripts/size-ledger.json'), 'utf8'))[CODE_FILE]).toBe(BIG)

    const grown = check({ 'scripts/size-ledger.json': ledgerOf({ [CODE_FILE]: 34 * 1024 }), [CODE_FILE]: codeFile(BIG) }, ['--lower'])
    expect(JSON.parse(readFileSync(join(grown.root, 'scripts/size-ledger.json'), 'utf8'))[CODE_FILE]).toBe(34 * 1024)
    const still = check({ 'scripts/size-ledger.json': ledgerOf({ [CODE_FILE]: 34 * 1024 }), [CODE_FILE]: codeFile(BIG) })
    expect(still.status).toBe(1)

    const dropped = check({ 'scripts/size-ledger.json': ledgerOf({ [CODE_FILE]: 34 * 1024 }) }, ['--lower'])
    expect(JSON.parse(readFileSync(join(dropped.root, 'scripts/size-ledger.json'), 'utf8'))[CODE_FILE]).toBeUndefined()
  })

  it('--init refuses to overwrite a ledger and refuses over-budget instruction files', () => {
    const withLedger = check({ 'scripts/size-ledger.json': ledgerOf({}), [CODE_FILE]: codeFile(BIG) }, ['--init'])
    expect(withLedger.status).toBe(1)
    expect(withLedger.output).toContain('already exists')
    expect(readFileSync(join(withLedger.root, 'scripts/size-ledger.json'), 'utf8')).toBe(ledgerOf({}))
    const badAgents = check({ [AGENTS]: `# AnnHub\n\n${'设'.repeat(3000)}\n` }, ['--init'])
    expect(badAgents.status).toBe(1)
    expect(badAgents.output).toContain('instruction files must fit their budget')
  })

  it('--init writes exactly the over-budget files', () => {
    const { root, status } = check({ [CODE_FILE]: codeFile(BIG) }, ['--init'])
    expect(status).toBe(0)
    const ledger = JSON.parse(readFileSync(join(root, 'scripts/size-ledger.json'), 'utf8'))
    expect(Object.keys(ledger)).toEqual([CODE_FILE])
  })
})
