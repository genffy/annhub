import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { InstallationHandler } from './installation-handler'

/**
 * 1.x upgrades left its credentials in chrome.storage.local (issue #96): an LLM
 * API key, a Eudic token and a Logseq auth token for services 2.0.0 no longer
 * talks to. Every update removes them by existence — installs that already
 * passed through 2.0.0 report `2.0.0` as their previous version.
 */

type InstalledListener = (details: { reason: string; previousVersion?: string }) => Promise<void>

function setup() {
  let listener: InstalledListener | undefined
  const remove = vi.fn(async (_keys: string[]) => undefined)
  vi.stubGlobal('browser', {
    runtime: { onInstalled: { addListener: (fn: InstalledListener) => (listener = fn), removeListener: vi.fn() } },
  })
  vi.stubGlobal('chrome', { storage: { local: { remove } } })
  new InstallationHandler().registerListeners()
  return { fire: (details: { reason: string; previousVersion?: string }) => listener!(details), remove }
}

afterEach(() => vi.unstubAllGlobals())

describe('the update cleanup (issue #96, storage.md §7)', () => {
  it('removes the 1.x credential keys when updating from 1.x', async () => {
    const { fire, remove } = setup()
    await fire({ reason: 'update', previousVersion: '1.0.3' })
    const keys = remove.mock.calls.flatMap(call => call[0])
    expect(keys).toEqual(expect.arrayContaining(['llmConfig', 'vocabConfig', 'annhub-logseq-config']))
    expect(keys).toEqual(expect.arrayContaining(['desktopDirectConnect']))
  })

  it('removes the 1.x credential keys on a 2.0.0-to-newer update too: existence, not version history, decides', async () => {
    const { fire, remove } = setup()
    await fire({ reason: 'update', previousVersion: '2.0.0' })
    const keys = remove.mock.calls.flatMap(call => call[0])
    expect(keys).toEqual(expect.arrayContaining(['llmConfig', 'vocabConfig', 'annhub-logseq-config']))
  })

  it('touches nothing on a first installation', async () => {
    const { fire, remove } = setup()
    await fire({ reason: 'install' })
    expect(remove).not.toHaveBeenCalled()
  })
})
