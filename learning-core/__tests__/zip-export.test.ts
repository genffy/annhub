import { describe, expect, it } from 'vitest'
import { buildExportZip, yamlFrontmatter, blobBytes, type ExportInput } from '../markdown-export'
import { crc32 } from '../zip'
import type { ImageAsset, ScreenshotRecord } from '../types'
import { makeFragment, makeFragmentOf, NOW } from './helpers'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function assetFixture(id: string): { metadata: ImageAsset; bytes: Blob } {
  return {
    metadata: { id, mimeType: 'image/png', byteLength: PNG_BYTES.length, sha256: 'fixed', width: 10, height: 10, createdAt: NOW },
    bytes: new Blob([PNG_BYTES]),
  }
}

function exportInput(overrides: Partial<ExportInput> = {}): ExportInput {
  const screenshot: ScreenshotRecord = { id: 'shot_1', assetId: 'asset_fix1', sourceUrl: 'https://example.com/s', capturedAt: NOW }
  return {
    exportedAt: NOW,
    fragments: [makeFragmentOf('visual'), makeFragment()],
    highlights: [{ id: 'hl_1', text: 'highlighted text', note: 'note', sourceUrl: 'https://example.com/s', createdAt: NOW }],
    clips: [{ id: 'clip_1', text: 'clip text', sourceUrl: 'https://example.com/s', createdAt: NOW }],
    screenshots: [screenshot],
    getAsset: async id => (id === 'asset_fix1' ? assetFixture(id) : undefined),
    ...overrides,
  }
}

/** Minimal central-directory reader for structural assertions. */
function readEocd(bytes: Uint8Array): { entries: number; centralSize: number; centralOffset: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      return { entries: view.getUint16(i + 10, true), centralSize: view.getUint32(i + 12, true), centralOffset: view.getUint32(i + 16, true) }
    }
  }
  throw new Error('EOCD not found')
}

function readEntryNames(bytes: Uint8Array): string[] {
  const { centralOffset, entries } = readEocd(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const names: string[] = []
  let p = centralOffset
  for (let i = 0; i < entries; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error(`bad central sig at ${p}`)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    names.push(decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)))
    p += 46 + nameLen + extraLen + commentLen
  }
  return names
}

/** Reads one store-only entry's text via the central directory. */
function readEntryText(bytes: Uint8Array, name: string): string {
  const { centralOffset, entries } = readEocd(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  let p = centralOffset
  for (let i = 0; i < entries; i++) {
    const size = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    if (decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)) === name) {
      const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
      return decoder.decode(bytes.subarray(dataStart, dataStart + size))
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`entry not found: ${name}`)
}

describe('yamlFrontmatter', () => {
  it('serializes scalars, arrays and escapes quotes/newlines', () => {
    const yaml = yamlFrontmatter([
      ['kind', 'visual'],
      ['tags', ['a', 'b"c']],
      ['n', 3],
      ['path', 'a\\b'],
    ])
    expect(yaml.startsWith('---\n')).toBe(true)
    expect(yaml.endsWith('\n---')).toBe(true)
    expect(yaml).toContain('kind: "visual"')
    expect(yaml).toContain('tags: ["a", "b\\"c"]')
    expect(yaml).toContain('n: 3')
    expect(yaml).toContain('path: "a\\\\b"')
  })
})

describe('buildExportZip (storage.md §7)', () => {
  it('produces a spec-shaped zip with the documented file set', async () => {
    const { blob, manifest } = await buildExportZip(exportInput())
    const bytes = await blobBytes(blob)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    const names = readEntryNames(bytes)
    expect(names).toContain('README.md')
    expect(names.filter(n => n.startsWith('fragments/')).length).toBe(2)
    expect(names).toContain('highlights/hl_1.md')
    expect(names).toContain('clips/clip_1.md')
    expect(names).toContain('screenshots/shot_1.md')
    expect(names).toContain('assets/asset_fix1.png')
    expect(manifest.partial).toBe(false)
    expect(manifest.counts).toEqual({ fragments: 2, highlights: 1, clips: 1, screenshots: 1, assets: 1 })
  })

  it('marks partial export and skips missing assets without dead links', async () => {
    const { blob, manifest } = await buildExportZip(exportInput({ getAsset: async () => undefined }))
    const bytes = await blobBytes(blob)
    const names = readEntryNames(bytes)
    expect(manifest.partial).toBe(true)
    expect(manifest.missingAssets).toContain('asset_fix1')
    expect(names.some(n => n.startsWith('assets/'))).toBe(false)
    const readmeIndex = names.indexOf('README.md')
    expect(readmeIndex).toBeGreaterThanOrEqual(0)
    // screenshot markdown should say the image is missing
    const { centralOffset } = readEocd(bytes)
    expect(centralOffset).toBeGreaterThan(0)
  })

  it('visual fragments link the real asset extension and never write dead links', async () => {
    const visual = makeFragmentOf('visual')
    const jpeg = { ...assetFixture('asset_fix1'), metadata: { ...assetFixture('asset_fix1').metadata, mimeType: 'image/jpeg' as const } }
    const present = await buildExportZip(exportInput({ fragments: [visual], getAsset: async () => jpeg }))
    const presentText = readEntryText(await blobBytes(present.blob), `fragments/${visual.id}.md`)
    expect(presentText).toContain('![截图](../assets/asset_fix1.jpg)')

    const missing = await buildExportZip(exportInput({ fragments: [visual], getAsset: async () => undefined }))
    const missingText = readEntryText(await blobBytes(missing.blob), `fragments/${visual.id}.md`)
    expect(missingText).not.toContain('![截图]')
    expect(missingText).toContain('图片缺失')
  })

  it('adds a review summary only after Desktop returned a rating (R3.2)', async () => {
    const fresh = makeFragment({ id: 'frag_new' })
    const reviewed = makeFragment({
      id: 'frag_rev',
      content: 'other note',
      normalizedContent: 'other note',
      review: { ...fresh.review, state: 'review', repetitions: 2, lapses: 1, intervalDays: 6, lastReviewedAt: NOW, nextReviewAt: NOW + 6 * 86_400_000 },
    })
    const { blob } = await buildExportZip(exportInput({ fragments: [fresh, reviewed] }))
    const bytes = await blobBytes(blob)
    expect(readEntryText(bytes, 'fragments/frag_new.md')).not.toContain('## 复习摘要')
    const text = readEntryText(bytes, 'fragments/frag_rev.md')
    expect(text).toContain('## 复习摘要')
    expect(text).toContain('状态：复习中（复习 2 次，遗忘 1 次）')
    expect(text).toContain('间隔 6 天')
  })

  it('crc32 guards content integrity', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
  })

  it('rejects unsafe ids to prevent path traversal', async () => {
    await expect(buildExportZip(exportInput({ fragments: [{ ...makeFragment(), id: '../evil' }] }))).rejects.toThrow(/UNSAFE_ID/)
  })
})
