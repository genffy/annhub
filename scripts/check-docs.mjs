#!/usr/bin/env node
// Documentation checks; run with `pnpm run check:docs`. No dependencies.
//
//   link         every relative link in tracked Markdown resolves, and a `#anchor` matches a heading in the target
//   section-ref  a `doc.md §N.M` reference — and a bare §N whose document the same line names — points at a section
//                that exists; sections are cited from Markdown and from source comments, so renumbering or dropping
//                a cited section turns this red here and not silently in the code
//   retired-id   a D-/Q-/RK-/M-/AP-/US-…/FX-/MD-/OP-/RD- identifier cited from any Markdown or source file must be
//                defined in some Markdown (a heading, a table's first cell or the start of a list item), so a retired
//                definition cannot leave dangling citations behind
//   dated-file   a Markdown file name carries a date, which pins a living document to the day it was last touched
//   header-meta  a document opens with 更新/状态/层级 lines — what changed when lives in git, delivery state in roadmap.md
//   date-in-prose  a document body names a calendar date; market.md is exempt, its facts carry their own check dates
//   history-wording  narrative wording (修复轮, 曾, 旧实现, …) — the word list lives in HISTORY_WORD below
//   round-label  a 真机走查/修复轮/P1-2 label in any tracked text file, Markdown or source
//
// Failures are printed as `path:line: [rule] what` and the process exits 1.
// `--root <dir>` runs the checks on another directory, so the tests can build a small tree.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootFlag = process.argv.indexOf('--root')
const root = rootFlag === -1 ? resolve(dirname(fileURLToPath(import.meta.url)), '..') : resolve(process.argv[rootFlag + 1])

const NOT_SOURCE = new Set(['node_modules', '.git', '.next', '.output', '.wxt', '.build', 'build', 'coverage'])
const VENDORED = /^\.(agents|claude)\/skills\/create-/
const LOCKFILE = /pnpm-lock\.yaml$/
const MAX_BYTES = 2_000_000
const TEXT = /\.(ts|tsx|js|mjs|cjs|css|json|html|yml|yaml)$/

/** The files that belong to the repository: tracked ones and new ones not yet added, so a change is checked before
 * it is committed. Vendored skills, lockfiles and oversized files are nobody's documentation. A tree without git (the
 * tests') is walked instead. */
function listFiles() {
  if (existsSync(join(root, '.git'))) {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(file => file && existsSync(join(root, file)))
  }
  const files = []
  const walk = directory => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name
      if (!entry.isDirectory()) files.push(relative)
      else if (!NOT_SOURCE.has(entry.name)) walk(relative)
    }
  }
  walk('')
  return files
}

const files = listFiles().filter(file => !VENDORED.test(file) && !LOCKFILE.test(file) && statSync(join(root, file)).size <= MAX_BYTES)
const markdownFiles = files.filter(file => file.endsWith('.md'))
const sourceFiles = files.filter(file => TEXT.test(file))
const read = file => readFileSync(join(root, file), 'utf8')

/** Lines outside fenced code blocks, with their 1-based numbers. */
function* proseLines(text) {
  let inFence = false
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*(```|~~~)/.test(lines[index])) {
      inFence = !inFence
      continue
    }
    if (!inFence) yield { line: lines[index], n: index + 1 }
  }
}

// --- link: relative links and #anchors ---------------------------------------------------------------------------

function checkLinks() {
  /** GitHub's heading slug: lowercase, drop punctuation, spaces to hyphens. */
  function slugify(heading) {
    let text = heading.trim().toLowerCase()
    // Inline HTML is dropped, keeping its text. One pass can leave a new tag behind (`<<b>b>`), so go on until it is stable.
    let previous
    do {
      previous = text
      text = text.replace(/<[^>]+>/g, '')
    } while (text !== previous)
    return text
      .replace(/[`*_~[\]()]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s/g, '-')
  }

  const anchorCache = new Map()
  function anchorsOf(file) {
    if (anchorCache.has(file)) return anchorCache.get(file)
    const anchors = new Set()
    const seen = new Map()
    let inFence = false
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
      if (inFence) continue
      const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
      if (!match) continue
      const slug = slugify(match[1])
      const count = seen.get(slug) ?? 0
      seen.set(slug, count + 1)
      anchors.add(count === 0 ? slug : `${slug}-${count}`)
    }
    anchorCache.set(file, anchors)
    return anchors
  }

  const problems = []
  let links = 0
  for (const relative of markdownFiles) {
    const file = join(root, relative)
    if (!existsSync(file)) continue // deleted in the working tree
    let inFence = false
    read(relative)
      .split('\n')
      .forEach((line, index) => {
        if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
        if (inFence) return
        // Inline code can show link syntax without being a link.
        const text = line.replace(/`[^`]*`/g, '')
        for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
          links += 1
          const href = match[1]
          if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue // external
          const [pathPart, anchor] = href.split('#')
          const target = pathPart ? resolve(dirname(file), decodeURI(pathPart)) : file
          if (!existsSync(target)) {
            problems.push(`${relative}:${index + 1}: [link] missing target ${href}`)
            continue
          }
          if (anchor && statSync(target).isFile() && extname(target) === '.md') {
            if (!anchorsOf(target).has(decodeURI(anchor).toLowerCase())) {
              problems.push(`${relative}:${index + 1}: [link] no heading for #${anchor} in ${pathPart || relative}`)
            }
          }
        }
      })
  }
  return { problems, detail: `${markdownFiles.length} Markdown files, ${links} relative links` }
}

// --- section-ref: `doc.md §N.M` points at a section that exists ---------------------------------------------------

/** Which numbered sections each document has; `§8.11` can also mean the eleventh numbered item inside §8. */
function buildDocIndex() {
  const docIndex = new Map()
  for (const file of markdownFiles) {
    const numbers = new Set()
    const items = new Set()
    let current = null
    for (const { line } of proseLines(read(file))) {
      const numbered = /^#{1,6}\s+(\d+(?:\.\d+)*)[.、\s]/.exec(line)
      if (numbered) {
        numbers.add(numbered[1])
        current = numbered[1]
        continue
      }
      if (/^#{1,6}\s/.test(line)) {
        current = null
        continue
      }
      const item = /^\s{0,3}(\d+)\.\s/.exec(line)
      if (item && current) items.add(`${current}.${item[1]}`)
    }
    docIndex.set(file, { numbers, items })
  }
  return docIndex
}

function checkSectionReferences() {
  const docIndex = buildDocIndex()
  const byName = new Map()
  for (const file of markdownFiles) {
    const name = basename(file, '.md')
    if (['README', 'AGENTS', 'SKILL'].includes(name)) continue
    if (!byName.has(name) || file.startsWith('docs/product/')) byName.set(name, file)
  }
  const SHORT = [...byName.keys()].sort((a, b) => b.length - a.length).join('|')

  /** Which document a § reference belongs to: the `name.md` just left of it; else the `](name.md)` link right of it;
   * else the product-document short name left of it (`extension §2.2`); else the file itself when it is Markdown. */
  function resolveTarget(line, start, end, owner) {
    const left = line.slice(Math.max(0, start - 80), start)
    const direct = /([A-Za-z][\w-]*)\.md(?:#[^\s)\]]*)?[\])`"'\s,，、]*$/.exec(left)
    if (direct && byName.has(direct[1])) return byName.get(direct[1])
    const right = line.slice(end, end + 100)
    const linked = /^[^\]\n]{0,24}\]\(([^)#\s]+\.md)/.exec(right)
    if (linked) {
      const target = posix.normalize(posix.join(dirname(owner), linked[1]))
      if (docIndex.has(target)) return target
    }
    const short = new RegExp(`(?<![\\w-])(${SHORT})[\\s\`]*$`).exec(left)
    if (short) return byName.get(short[1])
    return owner.endsWith('.md') ? owner : null
  }

  const references = []
  function collectReferences(file, text) {
    const isMarkdown = file.endsWith('.md')
    const lines = isMarkdown ? [...proseLines(text)] : text.split('\n').map((line, index) => ({ line, n: index + 1 }))
    for (const { line, n } of lines) {
      if (!line.includes('§')) continue
      let target = null
      let lastEnd = -1
      for (const match of line.matchAll(/§\s*(\d+(?:\.\d+)*)(?:\s*[-–~]\s*(\d+(?:\.\d+)*))?/g)) {
        // § references joined by 、, 和 - – ~ share the target of the one before them (`§1.1、§2.1`, `§3-§7`).
        const continues = lastEnd >= 0 && /^[\s、,，/和及与或\-–~]*$/.test(line.slice(lastEnd, match.index))
        if (!continues) target = resolveTarget(line, match.index, match.index + match[0].length, file)
        lastEnd = match.index + match[0].length
        if (!target) continue
        const numbers = [match[1]]
        if (match[2] && (match[2].includes('.') || !match[1].includes('.'))) numbers.push(match[2])
        for (const number of numbers) references.push({ from: file, n, doc: target, number })
      }
    }
  }
  for (const file of markdownFiles) collectReferences(file, read(file))
  for (const file of sourceFiles) collectReferences(file, read(file))

  const problems = references
    .filter(ref => {
      const index = docIndex.get(ref.doc)
      return index && !index.numbers.has(ref.number) && !index.items.has(ref.number)
    })
    .map(ref => `${ref.from}:${ref.n}: [section-ref] ${ref.doc} §${ref.number} does not exist`)
  return { problems, detail: `${references.length} section references` }
}

// --- retired-id: cited identifiers are defined somewhere -----------------------------------------------------------

/** An identifier family: D-/Q-/RK-/AP-/M-/US-<AREA>/FX-/MD-/OP-/RD- followed by digits, not inside another word. */
const FAMILY = String.raw`(?<![A-Za-z0-9-])(D|Q|RK|AP|M|US-[A-Z]+|FX|MD|OP|RD)-(\d+)(?![\w-])`

function checkRetiredIds() {
  /** A Markdown line defines the identifiers it names when it is a heading (anywhere on the line), a table's first
   * cell, or the start of a list item — bold and backticks allowed. Everything else is a citation. */
  function isDefinition(line, index) {
    if (/^#{1,6}\s/.test(line)) return true
    const before = line.slice(0, index)
    return /^\|\s*(?:\*\*|`)*$/.test(before) || /^\s*[-*]\s+(?:\*\*|`)*$/.test(before)
  }

  const defined = new Set()
  const citations = []
  const scan = (file, markdown) => {
    const lines = markdown
      ? [...proseLines(read(file))]
      : read(file)
          .split('\n')
          .map((line, index) => ({ line, n: index + 1 }))
    for (const { line, n } of lines) {
      for (const match of line.matchAll(new RegExp(FAMILY, 'g'))) {
        if (markdown && isDefinition(line, match.index)) defined.add(`${match[1]}-${match[2]}`)
        else citations.push({ place: `${file}:${n}`, id: `${match[1]}-${match[2]}` })
      }
    }
  }
  for (const file of markdownFiles) scan(file, true)
  for (const file of sourceFiles) scan(file, false)

  const problems = citations
    .filter(citation => !defined.has(citation.id))
    .map(citation => `${citation.place}: [retired-id] ${citation.id} is cited but not defined in any Markdown`)
  return { problems, detail: `${citations.length} identifier citations` }
}

// --- dated-file: a Markdown file name carries a date ---------------------------------------------------------------

function checkDatedFiles() {
  const problems = markdownFiles.filter(file => /20\d\d-\d\d/.test(basename(file, '.md'))).map(file => `${file}: [dated-file] the file name contains a date`)
  return { problems, detail: `${markdownFiles.length} Markdown file names` }
}

// --- header-meta: an update/status line in a document's first lines ------------------------------------------------

function checkHeaderMeta() {
  const headerMeta = /^(> )?(更新时间|更新|核对日期|状态|层级)[：:]/
  const problems = []
  for (const file of markdownFiles) {
    const lines = read(file).split('\n', 12)
    for (let index = 0; index < lines.length; index += 1) {
      if (headerMeta.test(lines[index])) problems.push(`${file}:${index + 1}: [header-meta] the document opens with an update/status line`)
    }
  }
  return { problems, detail: `${markdownFiles.length} Markdown files` }
}

// --- date-in-prose: a date in a document's body (market.md states facts and carries their check dates) --------------

function checkDatesInProse() {
  const date = /20\d\d-\d\d-\d\d|\d{4} 年 \d+ 月/
  const problems = []
  let checked = 0
  for (const file of markdownFiles) {
    if (file === 'docs/product/market.md') continue
    for (const { line, n } of proseLines(read(file))) {
      checked += 1
      if (date.test(line)) problems.push(`${file}:${n}: [date-in-prose] the body names a calendar date`)
    }
  }
  return { problems, detail: `${checked} body lines outside market.md` }
}

// --- history-wording: words that only ever tell how something came to be ---------------------------------------------

const HISTORY_WORD = /(修复轮|修复前|修复后|真机走查|第[一二三四五六七八九十]+轮|已移出|旧实现|原先|曾经|曾有|曾是|曾在|曾出现|量到过|偶发失败过|都出现过|已实现)/

function checkHistoryWording() {
  const problems = []
  let checked = 0
  for (const file of markdownFiles) {
    for (const { line, n } of proseLines(read(file))) {
      checked += 1
      if (HISTORY_WORD.test(line)) problems.push(`${file}:${n}: [history-wording] the line uses narrative wording (${HISTORY_WORD.exec(line)[1]})`)
    }
  }
  return { problems, detail: `${checked} body lines` }
}

// --- round-label: a fix-round or defect label in any tracked text file ------------------------------------------------

const ROUND_LABEL = /真机走查|修复轮|(^|[^A-Za-z0-9])P[0-3]-[0-9]+([^A-Za-z0-9-]|$)/

function checkRoundLabels() {
  const problems = []
  let checked = 0
  const scan = (file, markdown) => {
    if (file === 'scripts/check-docs.mjs') return // the word lists and this rule's own pattern live here
    const lines = markdown ? [...proseLines(read(file))] : read(file).split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      checked += 1
      const line = markdown ? lines[index].line : lines[index]
      if (ROUND_LABEL.test(line)) problems.push(`${file}:${index + 1}: [round-label] the line carries a fix-round or defect label`)
    }
  }
  for (const file of markdownFiles) scan(file, true)
  for (const file of sourceFiles) scan(file, false)
  return { problems, detail: `${checked} text lines` }
}

// --- agents-tree: instruction files are reachable, and no @ imports ------------------------------------------------

function checkAgentsTree() {
  const agents = markdownFiles.filter(file => basename(file) === 'AGENTS.md')
  const notes = markdownFiles.filter(file => /(^|\/)notes\/[^/]+\.md$/.test(file))
  const targetsOf = file => {
    const targets = new Set()
    for (const { line } of proseLines(read(file))) {
      const text = line.replace(/`[^`]*`/g, '')
      for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        targets.add(posix.normalize(posix.join(dirname(file), match[1].split('#')[0])))
      }
    }
    return targets
  }
  const problems = []
  for (const file of [...agents, ...notes]) {
    if (file === 'AGENTS.md') continue // the root is loaded every session, not linked
    // the nearest AGENTS.md up the tree links it; the root does when no intermediate one exists
    let directory = dirname(file)
    let linker = 'AGENTS.md'
    while (directory && directory !== '.') {
      if (agents.includes(`${directory}/AGENTS.md`) && `${directory}/AGENTS.md` !== file) {
        linker = `${directory}/AGENTS.md`
        break
      }
      const parent = posix.dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    if (!existsSync(join(root, linker)) || !targetsOf(linker).has(file)) {
      problems.push(`${file}: [agents-tree] not linked from ${linker}`)
    }
  }
  // an `@path` outside code spans or fences would be treated as an import and inlined whole
  let scanned = 0
  for (const file of agents) {
    for (const { line, n } of proseLines(read(file))) {
      scanned += 1
      const text = line.replace(/`[^`]*`/g, '')
      const match = /(^|\s)@[\w./~-]+/.exec(text)
      if (match) problems.push(`${file}:${n}: [agents-tree] an @import would inline the file whole: put the path in backticks`)
    }
  }
  return { problems, detail: `${agents.length} instruction files, ${notes.length} notes, ${scanned} lines scanned for imports` }
}

// --- list-tail: a convention-file list item does not end on "；" -----------------

/** `AGENTS.md` and `notes/*.md` carry rules as list items; a "；" on an item's
 * last line means the sentence was split into fragments (RV-DOC-03). A "；"
 * is fine while the item keeps going on the next line. */
function checkListTail() {
  const targets = markdownFiles.filter(file => basename(file) === 'AGENTS.md' || /(^|\/)notes\/[^/]+\.md$/.test(file))
  const problems = []
  for (const file of targets) {
    const lines = [...proseLines(read(file))]
    for (let index = 0; index < lines.length; index += 1) {
      const { line, n } = lines[index]
      if (!line.trimEnd().endsWith('；')) continue
      const next = lines[index + 1]?.line ?? ''
      // the item continues when the next prose line is not a new item or a heading
      const continues = next.trim() !== '' && !/^\s*[-*]\s/.test(next) && !/^#{1,6}\s/.test(next) && !/^\s*\|/.test(next) && !/^\s*\d+\.\s/.test(next)
      if (!continues) problems.push(`${file}:${n}: [list-tail] a list item ends on "；" — merge the fragments into one sentence (RV-DOC-03)`)
    }
  }
  return { problems, detail: `${targets.length} convention files, list tails checked` }
}

// --- run ----------------------------------------------------------------------------------------------------------

const rules = [
  ['link', checkLinks],
  ['section-ref', checkSectionReferences],
  ['retired-id', checkRetiredIds],
  ['dated-file', checkDatedFiles],
  ['header-meta', checkHeaderMeta],
  ['date-in-prose', checkDatesInProse],
  ['history-wording', checkHistoryWording],
  ['round-label', checkRoundLabels],
  ['agents-tree', checkAgentsTree],
  ['list-tail', checkListTail],
]

const problems = []
const report = []
for (const [name, check] of rules) {
  const { problems: ruleProblems, detail } = check()
  problems.push(...ruleProblems)
  report.push(`${name}: ${detail}${ruleProblems.length ? `, ${ruleProblems.length} broken` : ', all pass'}`)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} broken documentation reference(s).`)
  process.exit(1)
}
console.log(report.join('\n'))
