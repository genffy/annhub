import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * `locales/*.yaml` hold the strings Chrome reads from the manifest (`__MSG_<key>__`) and
 * nothing else: the interface is localized by `utils/ui-text/`. The files once carried the
 * word-book UI of a removed feature; keep them exactly as large as the manifest.
 */

const root = resolve(__dirname, '../..')

/** The locale files are flat maps with quoted scalars; no YAML library needed. */
function flatKeys(file: string): Map<string, string> {
  const keys = new Map<string, string>()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const match = /^([A-Za-z0-9_]+):\s*'(.*)'\s*$/.exec(line)
    if (!match) throw new Error(`Unsupported YAML line in ${file}: ${line}`)
    keys.set(match[1]!, match[2]!)
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

describe('locales', () => {
  const english = flatKeys(join(root, 'locales/en.yaml'))
  const chinese = flatKeys(join(root, 'locales/zh_CN.yaml'))
  const manifestSource = readFileSync(join(root, 'wxt.config.ts'), 'utf8')
  const referenced = new Set([...manifestSource.matchAll(/__MSG_(\w+)__/g)].map(match => match[1]!))

  it('defines every key the manifest references, and nothing else', () => {
    expect([...referenced].filter(key => !english.has(key))).toEqual([])
    expect([...english.keys()].filter(key => !referenced.has(key))).toEqual([])
  })

  it('translates exactly the keys of the default locale', () => {
    expect([...chinese.keys()].sort()).toEqual([...english.keys()].sort())
  })

  it('leaves product wording to utils/ui-text instead of i18n.t', () => {
    const offenders: string[] = []
    for (const dir of ['entrypoints', 'utils', 'background-service']) {
      for (const file of sourceFiles(join(root, dir))) {
        if (/\bi18n\.t\(|#i18n/.test(readFileSync(file, 'utf8'))) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('names the product after what it does now', () => {
    const text = `${english.get('extName')} ${english.get('extDescription')}`
    expect(text).toMatch(/clip|screenshot|library/i)
    // The first release was a highlighter and vocabulary labeler; those words must not come back.
    expect(text).not.toMatch(/highlight mode|vocabulary|logseq|word book|fragment/i)
  })

  it('keeps the manifest strings within the Chrome Web Store limits', () => {
    for (const keys of [english, chinese]) {
      expect(keys.get('extName')!.length).toBeLessThanOrEqual(75)
      expect(keys.get('extDescription')!.length).toBeLessThanOrEqual(132)
    }
  })
})
