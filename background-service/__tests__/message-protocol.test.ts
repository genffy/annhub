import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Every message the UI may send (`UIToBackgroundMessage`) needs a handler in the
 * service worker. A declared-but-unhandled type fails silently at runtime — the
 * library clips list was empty for exactly that reason (GET_STORAGE).
 */

const root = resolve(__dirname, '../..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(path) ? [path] : []
  })
}

function declaredUiMessageTypes(): string[] {
  const source = readFileSync(join(root, 'types/messages.ts'), 'utf8')
  const union = /export type UIToBackgroundMessage =([\s\S]*?)\n\nexport type/.exec(source)?.[1] ?? ''
  const interfaces = [...union.matchAll(/\|\s*(\w+)/g)].map(match => match[1]!)
  return interfaces.map(name => {
    const body = new RegExp(`export interface ${name} extends BaseMessage \\{\\s*type: '([A-Z0-9_]+)'`).exec(source)
    if (!body) throw new Error(`UIToBackgroundMessage member ${name} has no literal type`)
    return body[1]!
  })
}

/** Every `type: 'X'` literal in production code outside the type declarations: that is where messages are sent. */
function sentTypes(): Set<string> {
  const sent = new Set<string>()
  for (const dir of ['background-service', 'entrypoints', 'components', 'utils']) {
    for (const file of sourceFiles(join(root, dir))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\btype:\s*'([A-Z][A-Z0-9_]+)'/g)) sent.add(match[1]!)
    }
  }
  return sent
}

function handledTypes(): Set<string> {
  const handled = new Set<string>()
  for (const file of sourceFiles(join(root, 'background-service'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/^\s+'?([A-Z][A-Z0-9_]+)'?\s*:\s*(?:async\b|\(|[a-zA-Z]+\()/gm)) handled.add(match[1]!)
  }
  return handled
}

describe('message protocol', () => {
  it('finds the declared message types', () => {
    expect(declaredUiMessageTypes().length).toBeGreaterThan(25)
  })

  it('registers a handler for every UIToBackgroundMessage type', () => {
    const handled = handledTypes()
    const missing = declaredUiMessageTypes().filter(type => !handled.has(type))
    expect(missing).toEqual([])
  })

  it('has no declared message that nothing sends (a handler nobody calls is dead protocol)', () => {
    const sent = sentTypes()
    expect(declaredUiMessageTypes().filter(type => !sent.has(type))).toEqual([])
  })

  it('declares every type once', () => {
    const types = declaredUiMessageTypes()
    expect(types.filter((type, index) => types.indexOf(type) !== index)).toEqual([])
  })
})
