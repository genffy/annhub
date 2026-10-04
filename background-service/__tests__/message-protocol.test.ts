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
    return path.endsWith('.ts') ? [path] : []
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

function handledTypes(): Set<string> {
  const handled = new Set<string>()
  for (const file of sourceFiles(join(root, 'background-service'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/^\s+'?([A-Z][A-Z0-9_]+)'?\s*:\s*(?:async\b|\()/gm)) handled.add(match[1]!)
  }
  return handled
}

describe('message protocol', () => {
  it('finds the declared message types', () => {
    expect(declaredUiMessageTypes().length).toBeGreaterThan(40)
  })

  it('registers a handler for every UIToBackgroundMessage type', () => {
    const handled = handledTypes()
    const missing = declaredUiMessageTypes().filter(type => !handled.has(type))
    expect(missing).toEqual([])
  })

  it('declares every type once', () => {
    const types = declaredUiMessageTypes()
    expect(types.filter((type, index) => types.indexOf(type) !== index)).toEqual([])
  })
})
