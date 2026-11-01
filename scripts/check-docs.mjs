#!/usr/bin/env node
// Documentation checks; run with `npm run check:docs`. No dependencies.
//
//   link         every relative link in tracked Markdown resolves, and a `#anchor` matches a heading in the target
//   section-ref  a `doc.md §N.M` reference — and a bare §N whose document the same line names — points at a section
//                that exists; sections are cited from Markdown and from source comments, so renumbering or dropping
//                a cited section turns this red here and not silently in the code
//   retired-id   a D-/Q-/RK-/M-/AP-/US-…/FX-/MD-/OP-/RD- identifier cited from any Markdown or source file must be
//                defined in some Markdown (a heading, a table's first cell or the start of a list item), so a retired
//                definition cannot leave dangling citations behind
//   dated-file   a Markdown file name carries a date, which pins a living document to the day it was last touched
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
const LOCKFILE = /package-lock\.json$/
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

// --- run ----------------------------------------------------------------------------------------------------------

const rules = [
  ['link', checkLinks],
  ['section-ref', checkSectionReferences],
  ['retired-id', checkRetiredIds],
  ['dated-file', checkDatedFiles],
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
