import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDisabledSite, readSettings, writeSettings } from './settings-schema'

let stored: Record<string, unknown>
beforeEach(() => {
  stored = {}
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: stored[key] }),
        set: async (patch: Record<string, unknown>) => {
          await new Promise(resolve => setTimeout(resolve, 1))
          Object.assign(stored, patch)
        },
      },
    },
  })
})

describe('settings schema (RV-BG-07)', () => {
  it('rejects invalid values without changing valid settings', async () => {
    await writeSettings({ downloadQuality: 0.8 })
    await expect(writeSettings({ downloadQuality: 0.1 })).rejects.toThrow()
    await expect(writeSettings({ watermark: { enabled: true, text: 'x'.repeat(41), position: 'top-left', size: 'small', opacity: 0.5 } })).rejects.toThrow()
    await expect(writeSettings({ ratioPresets: ['unsupported'] })).rejects.toThrow()
    expect((await readSettings()).downloadQuality).toBe(0.8)
    expect((await readSettings()).watermark.text).toBe('')
  })

  it('merges nested patches, discards unknown keys and repairs invalid stored values', async () => {
    await writeSettings({ watermark: { enabled: true, text: 'AnnHub', position: 'top-left', size: 'small', opacity: 0.7 } })
    await writeSettings({ watermark: { opacity: 0.5 } } as never)
    expect((await readSettings()).watermark).toMatchObject({ text: 'AnnHub', position: 'top-left', opacity: 0.5 })
    stored['annhub.settings'] = { downloadQuality: 100, unknown: 'secret', watermark: { text: 'x'.repeat(41) } }
    expect(await readSettings()).toMatchObject({ downloadQuality: 0.9, watermark: { text: '' } })
    expect(JSON.stringify(await readSettings())).not.toContain('secret')
  })

  it('covers avatars and names unless one is switched off, also for settings stored before the switch existed', async () => {
    stored['annhub.settings'] = { anonymizeDefault: false }
    expect(await readSettings()).toMatchObject({ anonymizeDefault: false, anonymizeAvatars: true, anonymizeNames: true })
    await writeSettings({ anonymizeAvatars: false })
    expect(await readSettings()).toMatchObject({ anonymizeDefault: false, anonymizeAvatars: false, anonymizeNames: true })
    await expect(writeSettings({ anonymizeNames: 'no' } as never)).rejects.toThrow()
    expect((await readSettings()).anonymizeNames).toBe(true)
  })

  it('serializes concurrent site additions', async () => {
    await Promise.all([addDisabledSite('first.example'), addDisabledSite('second.example')])
    expect((await readSettings()).blockDisabledSites).toEqual(['first.example', 'second.example'])
    await expect(addDisabledSite('https://bad.example/path')).rejects.toThrow()
  })
})
