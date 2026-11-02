#!/usr/bin/env node
// Byte budgets per file class, run with `npm run check:size`. No dependencies.
//
// Instruction files (AGENTS.md, CLAUDE.md, notes/*.md) must fit their budget; every other
// budgeted file that is already over budget is on the ledger (scripts/size-ledger.json), which
// only goes down: a ledgered file may not grow, and when it shrinks below its recorded ceiling
// the check says so (`--lower` records the smaller value). Budgets are bytes, not lines — a
// Chinese character is three bytes. See scripts/README.md for the category table and the rules.
//
//   --init     write the ledger for the current over-budget files (refuses when it exists)
//   --lower    lower ledger entries to the current ceiling, drop entries at or under budget
//   --report   print per-class counts, the largest file and the ledger's total overshoot
//   --root <dir>  run on another directory (the tests')

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootFlag = process.argv.indexOf('--root')
const root = rootFlag === -1 ? resolve(dirname(fileURLToPath(import.meta.url)), '..') : resolve(process.argv[rootFlag + 1])
const ledgerPath = join(root, 'scripts/size-ledger.json')
const KB = 1024
const ceilKB = bytes => Math.ceil(bytes / KB) * KB

const NOT_SOURCE = new Set(['node_modules', '.git', '.next', '.output', '.wxt', '.build', 'build', 'coverage'])
const CODE = /\.(ts|tsx|js|mjs|cjs)$/
// Only the line scan of instruction files reads a file; one larger than this is far over budget and is reported without being read.
const MAX_BYTES = 2_000_000

/** The files that belong to the repository: tracked ones and new ones not yet added. A tree
 * without git (the tests') is walked instead. Directory symlinks are not followed; files that
 * cannot be read are skipped. */
function listFiles() {
  if (existsSync(join(root, '.git'))) {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(file => {
        if (!file || !existsSync(join(root, file))) return false
        try {
          return statSync(join(root, file)).isFile()
        } catch {
          return false
        }
      })
  }
  const files = []
  const walk = directory => {
    let entries
    try {
      entries = readdirSync(join(root, directory), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!NOT_SOURCE.has(entry.name)) walk(relative)
      } else if (entry.isFile()) files.push(relative)
    }
  }
  walk('')
  return files
}

/** The first matching class wins. Unbudgeted classes return null. */
function classify(file) {
  if (file.endsWith('.md')) {
    const base = basename(file)
    if (base === 'AGENTS.md' || base === 'CLAUDE.md') return { class: 'agents', budget: 8 * KB }
    if (/(^|\/)notes\/[^/]+\.md$/.test(file)) return { class: 'note', budget: 8 * KB }
    return { class: 'doc', budget: 48 * KB }
  }
  if (!CODE.test(file)) {
    if (file.endsWith('.css')) {
      if (file.startsWith('docs/design/')) return null // hand-written prototype assets
      return { class: 'css', budget: 40 * KB }
    }
    return null // html, json, yaml, lockfiles, images, docs/design js
  }
  if (file.startsWith('docs/design/')) return null
  if (file.startsWith('scripts/data/')) return null
  const test = /(^|\/)__tests__\//.test(file) || /\.test\.[^.]+$/.test(file) || /\.spec\.[^.]+$/.test(file) || file.startsWith('e2e/')
  return { class: test ? 'test' : 'code', budget: (test ? 48 : 32) * KB }
}

const basename = file => file.slice(file.lastIndexOf('/') + 1)
const read = file => readFileSync(join(root, file), 'utf8')

function readLedger() {
  if (!existsSync(ledgerPath)) return null
  const text = read('scripts/size-ledger.json')
  // JSON.parse keeps only the last of duplicate keys, so a merge slip would silently raise a ceiling; name it instead.
  const keys = [...text.matchAll(/"([^"]+)":/g)].map(match => match[1])
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index)
  if (duplicate) {
    console.error(`${duplicate}: [duplicate] one entry per file; when a ledger merge conflicts, keep a single line`)
    process.exit(1)
  }
  return JSON.parse(text)
}

const ledger = readLedger()
const problems = []
const counts = new Map()
const largest = new Map()
let ledgerTotal = 0
let ledgerCount = 0

const files = listFiles()
for (const file of files) {
  const classified = classify(file)
  if (!classified) continue
  const { class: name, budget } = classified
  let size
  try {
    size = statSync(join(root, file)).size
  } catch {
    continue
  }
  counts.set(name, (counts.get(name) ?? 0) + 1)
  const biggest = largest.get(name)
  if (!biggest || size > biggest.size) largest.set(name, { file, size })

  if ((name === 'agents' || name === 'note') && size <= MAX_BYTES) {
    const lines = read(file).split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].length > 300) problems.push(`${file}:${index + 1}: [long-line] ${lines[index].length} characters — one rule per line, split it`)
    }
  }

  if (ledger && Object.hasOwn(ledger, file)) {
    ledgerCount += 1
    const recorded = ledger[file]
    if (size <= budget) {
      problems.push(`${file}: [settled] back within budget: run \`npm run check:size -- --lower\` to drop it from the ledger`)
    } else if (size > recorded) {
      ledgerTotal += size - budget
      problems.push(`${file}: [grew] a file on the ledger may not grow: put the new code in a new file`)
    } else {
      ledgerTotal += size - budget
      if (ceilKB(size) < recorded) problems.push(`${file}: [shrunk] smaller now: run \`npm run check:size -- --lower\` to record ${ceilKB(size)}`)
    }
    if (name === 'agents' || name === 'note') problems.push(`${file}: [no-ledger] instruction files never go on the ledger`)
  } else if (size > budget) {
    ledgerTotal += size - budget
    problems.push(`${file}: [over-budget] ${size} B exceeds the ${name} budget of ${budget} B: split it by responsibility; do not add it to the ledger`)
  }
}

if (ledger) {
  for (const file of Object.keys(ledger)) {
    if (!files.includes(file)) problems.push(`${file}: [stale] remove the entry (\`npm run check:size -- --lower\`)`)
  }
}

if (process.argv.includes('--report')) {
  for (const name of ['agents', 'note', 'doc', 'test', 'code', 'css']) {
    const big = largest.get(name)
    console.log(`${name}: ${counts.get(name) ?? 0} file(s), largest ${big ? `${big.file} ${(big.size / KB).toFixed(0)} KB` : '—'}`)
  }
  console.log(`ledger: ${ledgerCount} entr${ledgerCount === 1 ? 'y' : 'ies'}, ${(ledgerTotal / KB).toFixed(0)} KB over budget in total`)
  process.exit(0)
}

if (process.argv.includes('--init')) {
  const entries = {}
  for (const file of files) {
    const classified = classify(file)
    if (!classified) continue
    const size = statSync(join(root, file)).size
    if (size > classified.budget) entries[file] = ceilKB(size)
  }
  for (const file of Object.keys(entries)) {
    const classified = classify(file)
    if (classified.class === 'agents' || classified.class === 'note') {
      console.error(`${file}: [over-budget] instruction files must fit their budget before --init; split it first.`)
      process.exit(1)
    }
  }
  try {
    // The 'wx' flag creates the file or fails when it exists, so no one can create it between a check and the write.
    writeFileSync(ledgerPath, `${JSON.stringify(entries, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    console.error('size-ledger.json already exists; use --lower to maintain it.')
    process.exit(1)
  }
  console.log(`size-ledger.json written with ${Object.keys(entries).length} entrie(s).`)
  process.exit(0)
}

if (process.argv.includes('--lower')) {
  if (!ledger) {
    console.error('no size-ledger.json to lower.')
    process.exit(1)
  }
  const next = {}
  for (const [file, recorded] of Object.entries(ledger)) {
    const classified = classify(file)
    if (!classified || !existsSync(join(root, file))) continue // gone, or no longer budgeted: drop
    const size = statSync(join(root, file)).size
    if (size <= classified.budget) continue // back within budget: drop
    next[file] = Math.min(recorded, ceilKB(size))
  }
  writeFileSync(ledgerPath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`size-ledger.json now has ${Object.keys(next).length} entrie(s).`)
  process.exit(0)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} file(s) over their size budget or ledger.`)
  process.exit(1)
}
const detail = ['agents', 'note', 'doc', 'test', 'code', 'css'].map(name => {
  const big = largest.get(name)
  return `${name}: ${counts.get(name) ?? 0} file(s), largest ${big ? `${big.file} ${(big.size / KB).toFixed(0)} KB` : '—'}`
})
console.log(`${detail.join('\n')}\nledger: ${ledgerCount} entr${ledgerCount === 1 ? 'y' : 'ies'}, ${(ledgerTotal / KB).toFixed(0)} KB over budget in total`)
