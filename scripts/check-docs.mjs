#!/usr/bin/env node
// Checks the relative links in every tracked Markdown file: the target file or
// directory must exist and a `#anchor` must match a heading in the target.
// No dependencies; run with `npm run check:docs`.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const markdownFiles = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)

/** GitHub's heading slug: lowercase, drop punctuation, spaces to hyphens. */
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
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

for (const relative of markdownFiles) {
  const file = join(root, relative)
  if (!existsSync(file)) continue // deleted in the working tree
  let inFence = false
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
      if (inFence) return
      // Inline code can show link syntax without being a link.
      const text = line.replace(/`[^`]*`/g, '')
      for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const href = match[1]
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue // external
        const [pathPart, anchor] = href.split('#')
        const target = pathPart ? resolve(dirname(file), decodeURI(pathPart)) : file
        if (!existsSync(target)) {
          problems.push(`${relative}:${index + 1}: missing target ${href}`)
          continue
        }
        if (anchor && statSync(target).isFile() && extname(target) === '.md') {
          if (!anchorsOf(target).has(decodeURI(anchor).toLowerCase())) {
            problems.push(`${relative}:${index + 1}: no heading for #${anchor} in ${pathPart || relative}`)
          }
        }
      }
    })
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} broken documentation link(s).`)
  process.exit(1)
}
console.log(`Checked ${markdownFiles.length} Markdown files: all relative links resolve.`)
