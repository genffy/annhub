import { describe, expect, it } from 'vitest'
import { buildExport, frontmatterFor, type ExportAsset } from '../export'
import { makeClip, makeHighlight, makeScreenshot, pngBlob, TEST_REGISTRY } from './helpers'

async function decode(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('frontmatterFor (storage.md §6, entry.md §5.5)', () => {
  it('writes keys in the fixed order with typed YAML values', () => {
    const entry = makeClip({
      properties: { title: "Retries 'quotes'", tags: ['reliability', 'retry'], author: ['Jane Doe'], published: '2026-09-12', project: '支付重试', reviewed: false, rating: 3.5 },
    })
    const fm = frontmatterFor(entry, TEST_REGISTRY)
    const keys = [...fm.matchAll(/^([a-z_]+):/gm)].map(match => match[1])
    expect(keys).toEqual(['annhub_id', 'annhub_type', 'title', 'source', 'created', 'author', 'published', 'tags', 'project', 'rating', 'reviewed'])
    expect(fm).toContain("title: 'Retries ''quotes'''")
    expect(fm).toContain('annhub_type: clip')
    expect(fm).toContain('published: 2026-09-12')
    expect(fm).toContain('rating: 3.5')
    expect(fm).toContain('reviewed: false')
    expect(fm).toContain('  - reliability')
    expect(fm).toContain('  - Jane Doe')
    expect(fm).toContain("project: '支付重试'")
  })

  it('skips unset properties entirely', () => {
    const fm = frontmatterFor(makeScreenshot(), TEST_REGISTRY)
    expect(fm).not.toContain('tags:')
    expect(fm).not.toContain('author:')
    expect(fm).toContain('annhub_type: screenshot')
  })
})

describe('buildExport (storage.md §6)', () => {
  it('produces README, clips/<id>.md, screenshots/<id>.md and assets/<assetId>.png', async () => {
    const clip = makeClip({ highlights: [makeHighlight({ start: 0, end: 11, quote: 'Exponential', note: 'why' })], note: 'my note' })
    const shot = makeScreenshot()
    const summary = await buildExport({
      exportedAt: Date.parse('2026-10-08T12:00:00Z'),
      lang: 'zh',
      entries: [clip, shot],
      registry: TEST_REGISTRY,
      readAsset: async id =>
        id === shot.assetId
          ? ({ metadata: { id, mimeType: 'image/png', byteLength: 8, sha256: '0'.repeat(64), width: 4, height: 4, createdAt: 0 }, bytes: new Uint8Array(8) } as ExportAsset)
          : undefined,
    })
    expect(summary.result).toBe('full')
    expect(summary.clips).toBe(1)
    expect(summary.screenshots).toBe(1)
    const bytes = await decode(summary.blob)
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('README.md')
    expect(text).toContain(`clips/${clip.id}.md`)
    expect(text).toContain(`screenshots/${shot.id}.md`)
    expect(text).toContain(`assets/${shot.assetId}.png`)
  })

  it('writes the localized sections, ==marks== and highlight notes into the clip body', async () => {
    const content = 'Intro paragraph here.\n\n## Section\n\nBody second block.'
    const start = content.indexOf('Intro')
    const clip = makeClip({ content, highlights: [makeHighlight({ start, end: start + 5, quote: 'Intro', note: 'why this matters' })], note: 'compare' })
    const summary = await buildExport({
      exportedAt: 0,
      lang: 'zh',
      entries: [clip],
      registry: TEST_REGISTRY,
      readAsset: async () => undefined,
    })
    const text = new TextDecoder().decode(await decode(summary.blob))
    expect(text).toContain('## 原文')
    expect(text).toContain('==Intro==')
    expect(text).toContain('## 语境')
    expect(text).toContain('## 高亮备注')
    expect(text).toContain('> Intro')
    expect(text).toContain('why this matters')
    expect(text).toContain('## 备注')
    expect(text).toContain('compare')
  })

  it('screenshot markdown links the asset relatively', async () => {
    const shot = makeScreenshot()
    const summary = await buildExport({
      exportedAt: 0,
      lang: 'en',
      entries: [shot],
      registry: TEST_REGISTRY,
      readAsset: async id => ({ metadata: { id, mimeType: 'image/png', byteLength: 8, sha256: '0'.repeat(64), width: 4, height: 4, createdAt: 0 }, bytes: new Uint8Array(8) }),
    })
    const text = new TextDecoder().decode(await decode(summary.blob))
    expect(text).toContain('## Image')
    expect(text).toContain(`(../assets/${shot.assetId}.png)`)
    expect(text).toContain('# Export notes')
  })

  it('reports missing assets as a partial export without dead links', async () => {
    const shot = makeScreenshot()
    const summary = await buildExport({
      exportedAt: 0,
      lang: 'zh',
      entries: [shot],
      registry: TEST_REGISTRY,
      readAsset: async () => undefined,
    })
    expect(summary.result).toBe('partial')
    expect(summary.missingAssets).toEqual([shot.assetId])
    const text = new TextDecoder().decode(await decode(summary.blob))
    expect(text).toContain('图片缺失')
    expect(text).toContain(`- ${shot.assetId}`)
    expect(text).not.toContain(`(../assets/${shot.assetId}.png)`)
  })

  it('derives every internal path from controlled ids only', async () => {
    const nasty = makeScreenshot({ properties: { title: '../../etc/passwd' } })
    const summary = await buildExport({
      exportedAt: 0,
      lang: 'en',
      entries: [nasty],
      registry: TEST_REGISTRY,
      readAsset: async id => ({ metadata: { id, mimeType: 'image/png', byteLength: 8, sha256: '0'.repeat(64), width: 4, height: 4, createdAt: 0 }, bytes: new Uint8Array(8) }),
    })
    const text = new TextDecoder().decode(await decode(summary.blob))
    expect(text).toContain(`screenshots/${nasty.id}.md`)
    expect(text).not.toContain('etc/passwd.md')
  })
})

describe('zip writer compatibility', () => {
  it('round-trips a stored PNG blob byte-for-byte', async () => {
    const shot = makeScreenshot()
    const source = pngBlob(64)
    const bytes = new Uint8Array(await source.arrayBuffer())
    const summary = await buildExport({
      exportedAt: 0,
      lang: 'en',
      entries: [shot],
      registry: TEST_REGISTRY,
      readAsset: async id => ({ metadata: { id, mimeType: 'image/png', byteLength: bytes.length, sha256: '0'.repeat(64), width: 4, height: 4, createdAt: 0 }, bytes }),
    })
    const text = new TextDecoder().decode(await decode(summary.blob))
    // the stored entry data appears verbatim inside the store-only ZIP
    expect(text).toContain(String.fromCharCode(...bytes))
  })
})
