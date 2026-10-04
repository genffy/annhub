import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * `locales/en.yaml` holds the manifest strings and the few `i18n.t()` keys still
 * in use. It once carried the word-book UI of a removed feature and a store name
 * for a product that no longer exists; keep it exactly as large as its callers.
 */

const root = resolve(__dirname, '../..')
const MANIFEST_KEYS = ['extName', 'extDescription']

/** en.yaml is plain nested maps with quoted scalars; no YAML library needed. */
function flatKeys(file: string): Map<string, string> {
  const keys = new Map<string, string>()
  const stack: { indent: number; key: string }[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const match = /^(\s*)([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (!match) throw new Error(`Unsupported YAML line in ${file}: ${line}`)
    const indent = match[1]!.length
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()
    const path = [...stack.map(entry => entry.key), match[2]!].join('.')
    const value = match[3]!.trim()
    if (value) keys.set(path, value.replace(/^'(.*)'$/, '$1'))
    else stack.push({ indent, key: match[2]! })
  }
  return keys
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    if (['node_modules', '.output', '.wxt', 'e2e', '__tests__'].includes(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(path) ? [path] : []
  })
}

function usedKeys(): { literal: Set<string>; dynamic: string[] } {
  const literal = new Set<string>()
  const dynamic: string[] = []
  for (const dir of ['entrypoints', 'components', 'utils', 'background-service']) {
    for (const file of sourceFiles(join(root, dir))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bi18n\.t\(\s*([^,)]+)/g)) {
        const arg = match[1]!.trim()
        const quoted = /^'([^']+)'$/.exec(arg)
        if (quoted) literal.add(quoted[1]!)
        else dynamic.push(`${file}: i18n.t(${arg})`)
      }
    }
  }
  return { literal, dynamic }
}

describe('locales', () => {
  const english = flatKeys(join(root, 'locales/en.yaml'))

  it('only calls i18n.t with a literal key that exists', () => {
    const { literal, dynamic } = usedKeys()
    expect(dynamic).toEqual([])
    expect([...literal].filter(key => !english.has(key))).toEqual([])
  })

  it('has no key that nothing uses', () => {
    const { literal } = usedKeys()
    expect([...english.keys()].filter(key => !literal.has(key) && !MANIFEST_KEYS.includes(key))).toEqual([])
  })

  it('names the product after what it does now', () => {
    const text = `${english.get('extName')} ${english.get('extDescription')}`
    expect(text).toMatch(/fragment/i)
    // The first release was a highlighter and vocabulary labeler; those words must not come back.
    expect(text).not.toMatch(/highlight|vocabulary|logseq|word book/i)
  })

  it('keeps the manifest strings within the Chrome Web Store limits', () => {
    for (const file of ['en.yaml', 'zh_CN.yaml']) {
      const keys = flatKeys(join(root, 'locales', file))
      expect(keys.get('extName')!.length).toBeLessThanOrEqual(75)
      expect(keys.get('extDescription')!.length).toBeLessThanOrEqual(132)
    }
  })

  it('translates only keys the default locale defines', () => {
    const chinese = flatKeys(join(root, 'locales/zh_CN.yaml'))
    expect([...chinese.keys()].filter(key => !english.has(key))).toEqual([])
  })
})
