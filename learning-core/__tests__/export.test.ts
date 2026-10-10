import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { buildExport, frontmatterFor, type ExportAsset } from '../export'
import { sha256Hex } from '../assets'
import { makeClip, makeHighlight, makeScreenshot, pngBlob, TEST_REGISTRY } from './helpers'

async function decode(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

async function fixtureAsset(id: string, bytes: Uint8Array): Promise<ExportAsset> {
  return { metadata: { id, mimeType: 'image/png', byteLength: bytes.length, sha256: await sha256Hex(bytes), width: 4, height: 4, createdAt: 0 }, bytes }
}

describe('frontmatterFor (storage.md §6, entry.md §5.5)', () => {
  it('round-trips unusual keys and string-shaped list values through a YAML parser (RV-CORE-06)', () => {
    const names = ['Project: Alpha', 'a: b', '- x', '*x', '& x', '@x', '`x', '%x', '> x', '#todo', '[x]', '{y}', '! bang', '1e3', "a'b"]
    // names a YAML parser would read as a boolean or null if they stayed bare
    names.push('null', 'Null', 'NULL', '~', 'true', 'False', 'yes', 'No', 'on', 'OFF', 'y', 'n')
    const custom = Object.fromEntries(names.map((name, index) => [name, `value ${index}`]))
    const tags = ['ratio:', '2026-10-09', '0x1F', '#todo', "it's quoted"]
    const entry = makeClip({ properties: { title: 'YAML check', tags, ...custom } })
    const registry = [...TEST_REGISTRY, ...names.map(name => ({ name, type: 'text' as const, builtin: false, presets: [] }))]
    const frontmatter = frontmatterFor(entry, registry)
    const parsed = parse(frontmatter.slice(4, -4)) as Record<string, unknown>
    for (const name of names) expect(parsed[name], name).toBe(custom[name])
    expect(parsed.tags).toEqual(tags)
    expect(parsed.title).toBe('YAML check')
  })

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
    expect(fm).toContain("  - 'reliability'")
    expect(fm).toContain("  - 'Jane Doe'")
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
  it('builds a large image collection from Blob parts without retaining byte arrays (RV-BG-05)', async () => {
    const sourceBytes = new Uint8Array(5 * 1024 * 1024)
    const source = new Blob([sourceBytes], { type: 'image/png' })
    const digest = await sha256Hex(sourceBytes)
    const shots = Array.from({ length: 40 }, (_, index) => makeScreenshot({ id: `ent_large_${index}`, assetId: `asset_large_${index}` }))
    const summary = await buildExport({
      exportedAt: 0,
      lang: 'en',
      entries: shots,
      registry: TEST_REGISTRY,
      readAsset: async id => ({ metadata: { id, mimeType: 'image/png', byteLength: source.size, sha256: digest, width: 1, height: 1, createdAt: 0 }, bytes: source }),
    })
    expect(summary.result).toBe('full')
    expect(summary.blob.size).toBeGreaterThan(200 * 1024 * 1024)
  }, 30_000)

  it('produces README, clips/<id>.md, screenshots/<id>.md and assets/<assetId>.png', async () => {
    const clip = makeClip({ highlights: [makeHighlight({ start: 0, end: 11, quote: 'Exponential', note: 'why' })], note: 'my note' })
    const shot = makeScreenshot()
    const summary = await buildExport({
      exportedAt: Date.parse('2026-10-08T12:00:00Z'),
      lang: 'zh',
      entries: [clip, shot],
      registry: TEST_REGISTRY,
      readAsset: async id => (id === shot.assetId ? fixtureAsset(id, new Uint8Array(8)) : undefined),
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
    expect(text).not.toContain('## 原文')
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
      readAsset: id => fixtureAsset(id, new Uint8Array(8)),
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

  it('reports a corrupted asset as partial and omits its bytes (RV-CORE-06)', async () => {
    const shot = makeScreenshot()
    const corrupted = await fixtureAsset(shot.assetId!, new Uint8Array(8))
    corrupted.metadata.sha256 = '0'.repeat(64)
    const summary = await buildExport({ exportedAt: 0, lang: 'en', entries: [shot], registry: TEST_REGISTRY, readAsset: async () => corrupted })
    expect(summary.result).toBe('partial')
    expect(summary.missingAssets).toEqual([shot.assetId])
    const text = new TextDecoder().decode(await summary.blob.arrayBuffer())
    expect(text).not.toContain(`assets/${shot.assetId}.png`)
  })

  it('derives every internal path from controlled ids only', async () => {
    const nasty = makeScreenshot({ properties: { title: '../../etc/passwd' } })
    const summary = await buildExport({
      exportedAt: 0,
      lang: 'en',
      entries: [nasty],
      registry: TEST_REGISTRY,
      readAsset: id => fixtureAsset(id, new Uint8Array(8)),
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
      readAsset: id => fixtureAsset(id, bytes),
    })
    const text = new TextDecoder().decode(await decode(summary.blob))
    // the stored entry data appears verbatim inside the store-only ZIP
    expect(text).toContain(String.fromCharCode(...bytes))
  })
})
