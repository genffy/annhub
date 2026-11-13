import { afterEach, describe, expect, it, vi } from 'vitest'
import { keyCaps, readCommandBinding } from '../command-binding'

/**
 * A hint that names a key must name the one the browser holds, and none when it holds none (extension.md §7.1):
 * the default key is not the key the browser has bound, so it is never the answer here.
 */

/** What the browser lists for the extension's commands: a command nobody bound carries an empty key, or is left out. */
function browserLists(commands: { name: string; shortcut?: string }[]): void {
  vi.stubGlobal('chrome', { commands: { getAll: vi.fn(async () => commands) } })
}

afterEach(() => vi.unstubAllGlobals())

describe('the key the browser has bound to a command', () => {
  it('is the shortcut the browser lists for that command', async () => {
    browserLists([
      { name: 'capture-selection', shortcut: 'Ctrl+Shift+S' },
      { name: 'toggle-block-mode', shortcut: 'Ctrl+Shift+E' },
    ])
    await expect(readCommandBinding('capture-selection')).resolves.toBe('Ctrl+Shift+S')
    await expect(readCommandBinding('toggle-block-mode')).resolves.toBe('Ctrl+Shift+E')
  })

  it('is empty when the browser lists the command with no key', async () => {
    browserLists([{ name: 'capture-selection', shortcut: '' }])
    await expect(readCommandBinding('capture-selection')).resolves.toBe('')
  })

  it('is empty when the browser leaves the command out, and never another command’s key', async () => {
    browserLists([{ name: 'toggle-block-mode', shortcut: 'Ctrl+Shift+E' }])
    await expect(readCommandBinding('capture-selection')).resolves.toBe('')
  })
})

describe('the keycaps of a binding', () => {
  it('are one per name when the browser joins them with "+"', () => {
    expect(keyCaps('Ctrl+Shift+S')).toEqual(['Ctrl', 'Shift', 'S'])
  })

  it('are one per glyph when the browser writes them bare', () => {
    expect(keyCaps('⇧⌘S')).toEqual(['⇧', '⌘', 'S'])
  })

  it('are none for no binding', () => {
    expect(keyCaps('')).toEqual([])
  })
})
