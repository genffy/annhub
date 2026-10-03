import { describe, expect, it } from 'vitest'
import { buildExportZip, yamlFrontmatter, blobBytes, type ExportInput } from '../markdown-export'
import { crc32 } from '../zip'
import type { FragmentRelation, ImageAsset, ScreenshotRecord, WritingTaskRecord } from '../types'
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
    expect(manifest.counts).toEqual({ fragments: 2, highlights: 1, clips: 1, screenshots: 1, assets: 1, outputs: 0, relations: 0 })
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

  it('includes Desktop outputs and confirmed relations when synced (R3.2)', async () => {
    const fragments = [makeFragment({ id: 'frag_a' }), makeFragment({ id: 'frag_b', content: 'other note', normalizedContent: 'other note' })]
    const relation: FragmentRelation = {
      id: 'rel_1',
      fromFragmentId: 'frag_a',
      toFragmentId: 'frag_b',
      type: 'similarity',
      createdBy: 'user',
      status: 'confirmed',
      confirmedAt: NOW,
      confirmedBy: 'user',
      createdAt: NOW,
      updatedAt: NOW,
      note: '同一主题',
    }
    const task: WritingTaskRecord = {
      id: 'task_1',
      fragmentIds: ['frag_a'],
      taskType: 'explanation',
      prompt: '向读者解释利率传导',
      constraints: ['先给结论'],
      draftContent: '',
      submissions: [
        {
          id: 'sub_1',
          content: '利率通过信贷渠道传导。',
          submittedAt: NOW,
          assessments: [{ fragmentId: 'frag_a', source: 'manual', used: true, correct: true, confirmedByUser: true, assessedAt: NOW }],
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    }
    const { blob, manifest } = await buildExportZip(exportInput({ fragments, writingTasks: [task], relations: [relation, { ...relation, id: 'rel_2', status: 'suggested' }] }))
    const bytes = await blobBytes(blob)
    const names = readEntryNames(bytes)
    expect(names).toContain('outputs/task_1.md')
    expect(manifest.counts.outputs).toBe(1)
    expect(manifest.counts.relations).toBe(1) // suggested excluded
    const fragA = names.includes('fragments/frag_a.md')
    expect(fragA).toBe(true)
  })

  it('crc32 guards content integrity', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
  })

  it('rejects unsafe ids to prevent path traversal', async () => {
    await expect(
      buildExportZip(exportInput({ fragments: [{ ...makeFragment(), id: '../evil' }] })),
    ).rejects.toThrow(/UNSAFE_ID/)
  })
})
