/**
 * Cross-language interop fixtures (roadmap R1.1 gate: 单条消息和图片字节
 * 跨语言 fixture)。The canonical files under fixtures/interop/ are produced by
 * THIS TypeScript implementation and consumed by the Swift test suite
 * (app/Tests/AnnHubCoreTests via scripts/sync-interop-fixtures.sh).
 *
 * Run with WRITE_FIXTURES=1 to (re)generate the files (the fragment fixtures carry random ids, so
 * the Swift tests change with them; WRITE_REVIEW_FIXTURE=1 regenerates only review-questions.json);
 * without it, the test
 * validates the checked-in fixtures against the current code — a regression
 * guard for both ends of the wire contract.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFragment, createReviewState } from '../factory'
import { canonicalJson, sha256Hex, toFragmentWire } from '../wire'
import { crc32 } from '../zip'
import { validateFragment } from '../validate'
import { REVIEW_QUESTIONS } from '../review'
import type { FragmentRecord } from '../types'

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/interop')
const WRITE = process.env.WRITE_FIXTURES === '1'

const NOW = 1_769_000_000_000

function makeWire(fragment: FragmentRecord) {
  return toFragmentWire(fragment)
}

/** A minimal valid 4x2 opaque PNG built with stored (uncompressed) deflate. */
function tinyPng(): Uint8Array {
  const width = 4
  const height = 2
  const raw = new Uint8Array((width * 3 + 1) * height) // filter byte 0 + RGB rows
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = 200
      raw[row + 2 + x * 3] = 30 + y * 40
      raw[row + 3 + x * 3] = 60 + x * 30
    }
  }
  // zlib stream: 0x78 0x01 header + stored blocks + adler32
  const CHUNK = 0xffff
  const blocks: number[] = [0x78, 0x01]
  let offset = 0
  while (true) {
    const remaining = raw.length - offset
    const take = Math.min(remaining, CHUNK)
    const last = take === remaining
    blocks.push(last ? 1 : 0, take & 0xff, (take >> 8) & 0xff, ~take & 0xff, (~take >> 8) & 0xff)
    for (let i = 0; i < take; i++) blocks.push(raw[offset + i])
    offset += take
    if (last) break
  }
  let a = 1
  let b = 0
  for (const byte of raw) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  const adler = (b << 16) | a
  blocks.push((adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff)
  const idat = new Uint8Array(blocks)

  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length)
    out.set(new TextEncoder().encode(type), 4)
    out.set(data, 8)
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
    return out
  }

  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor RGB
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const parts = [signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]
  const total = parts.reduce((n, p) => n + p.length, 0)
  const png = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    png.set(part, at)
    at += part.length
  }
  return png
}

function buildFixtures(): void {
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const concept = createFragment({
    kind: 'concept',
    content: 'hawkish pivot',
    context: {
      excerpt: 'Investors rotated out of bonds after the Fed signalled a hawkish pivot on rates.',
      sourceUrl: 'https://www.wsj.com/articles/fed-hawkish-pivot',
      sourceHost: 'wsj.com',
      sourceTitle: 'WSJ — Fed coverage',
      locator: { type: 'none' },
    },
    processing: {
      guess: '紧缩立场的转变',
      verified: { confirmedAt: NOW - 1000, source: 'source-material', summary: '指向更紧缩的货币政策立场' },
      use: '在下周的宏观复盘里解释债券抛售。',
    },
    detail: { definition: '央行转向更紧缩政策', boundaries: ['不等于加息本身'] },
    tags: ['fed', 'macro'],
    now: NOW,
  })
  const mediaClip = createFragment({
    kind: 'media-clip',
    content: '主持人总结了三条要点',
    context: {
      excerpt: '主持人总结了三条要点（00:12–00:45 的转写节选），谈到了利率路径与通胀黏性。',
      sourceUrl: 'https://example.com/podcast/42',
      sourceHost: 'example.com',
      sourceTitle: 'Macro Pod #42',
      locator: { type: 'time', startMs: 12_000, endMs: 45_000 },
    },
    processing: {
      verified: { confirmedAt: NOW - 600, source: 'source-material', summary: '三条要点：利率、通胀、衰退概率' },
      use: '写下周宏观简报的利率段落时引用。',
    },
    detail: { startMs: 12_000, endMs: 45_000 },
    tags: ['podcast'],
    now: NOW,
  })
  const visual = createFragment({
    kind: 'visual',
    content: '净值曲线在加息后出现三次深回撤',
    context: {
      excerpt: '净值曲线在加息后出现三次深回撤（见截图）。',
      sourceUrl: 'https://example.com/performance',
      sourceHost: 'example.com',
      sourceTitle: 'Performance review',
      locator: { type: 'image', assetId: 'asset_fix1' },
      capturedAt: NOW - 5000,
    },
    processing: {
      verified: { confirmedAt: NOW - 800, source: 'source-material' },
      use: '用于下周风险复盘的图示。',
    },
    detail: { attachmentIds: ['asset_fix1'] },
    tags: ['chart'],
    now: NOW,
  })

  const conceptWire = makeWire(concept)
  const visualWire = makeWire(visual)
  const mediaWire = makeWire(mediaClip)
  const conceptCanonical = canonicalJson(conceptWire)
  const visualCanonical = canonicalJson(visualWire)
  const mediaCanonical = canonicalJson(mediaWire)

  const putBody = (deviceId: string, wire: unknown) => ({ deviceId, fragment: wire })

  // Rejection cases: valid-shaped bodies that must fail Desktop validation.
  const rejections = [
    {
      name: 'wrong-schema-version',
      expectedCode: 'SCHEMA_VERSION_UNSUPPORTED',
      body: putBody('device_1', { ...conceptWire, schemaVersion: 3 }),
    },
    {
      name: 'media-clip-bad-range',
      // locator (time) is validated before detail — bad ranges surface here first
      expectedCode: 'LOCATOR_INVALID',
      body: putBody('device_1', {
        ...mediaWire,
        detail: { startMs: 45_000, endMs: 45_000 },
        context: { ...mediaWire.context, locator: { type: 'time', startMs: 45_000, endMs: 45_000 } },
      }),
    },
    {
      name: 'missing-verification',
      expectedCode: 'VERIFIED_REQUIRED',
      body: putBody('device_1', { ...conceptWire, processing: { guess: 'x', use: '用于验证。' } }),
    },
    {
      name: 'use-copies-content',
      expectedCode: 'USE_COPIES_CONTENT',
      body: putBody('device_1', {
        ...conceptWire,
        processing: { verified: { confirmedAt: NOW, source: 'manual' }, use: conceptWire.content },
      }),
    },
    {
      name: 'llm-without-model-meta',
      expectedCode: 'VERIFIED_LLM_META_REQUIRED',
      body: putBody('device_1', {
        ...conceptWire,
        processing: { verified: { confirmedAt: NOW, source: 'llm' }, use: '用于验证。' },
      }),
    },
    {
      name: 'source-host-mismatch',
      expectedCode: 'SOURCE_HOST_MISMATCH',
      body: putBody('device_1', { ...conceptWire, context: { ...conceptWire.context, sourceHost: 'ft.com' } }),
    },
  ]

  const png = tinyPng()
  writeFileSync(resolve(FIXTURE_DIR, 'fragment-put-concept.json'), JSON.stringify(putBody('device_1', conceptWire), null, 2))
  writeFileSync(resolve(FIXTURE_DIR, 'fragment-put-visual.json'), JSON.stringify(putBody('device_1', visualWire), null, 2))
  writeFileSync(resolve(FIXTURE_DIR, 'fragment-put-media-clip.json'), JSON.stringify(putBody('device_1', mediaWire), null, 2))
  writeFileSync(resolve(FIXTURE_DIR, 'fragment-put-rejections.json'), JSON.stringify(rejections, null, 2))
  writeFileSync(
    resolve(FIXTURE_DIR, 'fragment-canonical.json'),
    JSON.stringify(
      {
        concept: { canonical: conceptCanonical, sha256: '' },
        visual: { canonical: visualCanonical, sha256: '' },
        mediaClip: { canonical: mediaCanonical, sha256: '' },
      },
      null,
      2,
    ),
  )
  writeFileSync(resolve(FIXTURE_DIR, 'asset.png'), png)
  writeFileSync(resolve(FIXTURE_DIR, 'asset-meta.json'), JSON.stringify({ sha256: '', byteLength: png.length, mimeType: 'image/png', width: 4, height: 2 }, null, 2))
}

async function finalizeHashes() {
  const manifest = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'fragment-canonical.json'), 'utf8')) as {
    concept: { canonical: string; sha256: string }
    visual: { canonical: string; sha256: string }
    mediaClip: { canonical: string; sha256: string }
  }
  manifest.concept.sha256 = await sha256Hex(manifest.concept.canonical)
  manifest.visual.sha256 = await sha256Hex(manifest.visual.canonical)
  manifest.mediaClip.sha256 = await sha256Hex(manifest.mediaClip.canonical)
  writeFileSync(resolve(FIXTURE_DIR, 'fragment-canonical.json'), JSON.stringify(manifest, null, 2))

  const png = new Uint8Array(readFileSync(resolve(FIXTURE_DIR, 'asset.png')))
  const assetMeta = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'asset-meta.json'), 'utf8')) as { sha256: string; byteLength: number }
  assetMeta.sha256 = await sha256Hex(png)
  assetMeta.byteLength = png.length
  writeFileSync(resolve(FIXTURE_DIR, 'asset-meta.json'), JSON.stringify(assetMeta, null, 2))
}

/** Deterministic, so it can be regenerated alone: the fragment fixtures carry random ids and change on every write. */
function writeReviewQuestions(): void {
  mkdirSync(FIXTURE_DIR, { recursive: true })
  writeFileSync(resolve(FIXTURE_DIR, 'review-questions.json'), JSON.stringify(REVIEW_QUESTIONS, null, 2) + '\n')
}

describe('interop fixtures (docs/v2/storage.md §8 wire contract)', () => {
  if (process.env.WRITE_REVIEW_FIXTURE === '1') {
    it('generates the review wording fixture', () => writeReviewQuestions())
  }
  if (WRITE) {
    it('generates the canonical fixture set', async () => {
      buildFixtures()
      writeReviewQuestions()
      await finalizeHashes()
      console.log(`fixtures written to ${FIXTURE_DIR}`)
    })
  }

  it('checked-in fixtures match the current TypeScript implementation', async () => {
    if (!existsSync(resolve(FIXTURE_DIR, 'fragment-put-concept.json'))) {
      throw new Error('fixtures missing — run WRITE_FIXTURES=1 npx vitest run learning-core/__tests__/interop-fixtures.test.ts')
    }
    const conceptBody = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'fragment-put-concept.json'), 'utf8')) as { deviceId: string; fragment: ReturnType<typeof toFragmentWire> }
    const visualBody = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'fragment-put-visual.json'), 'utf8')) as { deviceId: string; fragment: ReturnType<typeof toFragmentWire> }
    const mediaBody = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'fragment-put-media-clip.json'), 'utf8')) as { deviceId: string; fragment: ReturnType<typeof toFragmentWire> }
    const manifest = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'fragment-canonical.json'), 'utf8')) as {
      concept: { canonical: string; sha256: string }
      visual: { canonical: string; sha256: string }
      mediaClip: { canonical: string; sha256: string }
    }

    // Canonical JSON + hash parity — the exact bytes Desktop must reproduce.
    expect(canonicalJson(conceptBody.fragment)).toBe(manifest.concept.canonical)
    expect(await sha256Hex(manifest.concept.canonical)).toBe(manifest.concept.sha256)
    expect(canonicalJson(visualBody.fragment)).toBe(manifest.visual.canonical)
    expect(await sha256Hex(manifest.visual.canonical)).toBe(manifest.visual.sha256)
    expect(canonicalJson(mediaBody.fragment)).toBe(manifest.mediaClip.canonical)
    expect(await sha256Hex(manifest.mediaClip.canonical)).toBe(manifest.mediaClip.sha256)
    expect(mediaBody.fragment.detail).toEqual({ startMs: 12000, endMs: 45000 })
    expect(mediaBody.fragment.context.locator).toEqual({ type: 'time', startMs: 12000, endMs: 45000 })

    // Wire bodies must validate once a review state is attached (Desktop-side
    // reconstructs the same way).
    const withReview = (wire: typeof conceptBody.fragment): FragmentRecord => ({ ...wire, review: createReviewState(NOW) }) as FragmentRecord
    expect(validateFragment(withReview(conceptBody.fragment)).ok).toBe(true)
    expect(validateFragment(withReview(visualBody.fragment)).ok).toBe(true)
    expect(validateFragment(withReview(mediaBody.fragment)).ok).toBe(true)
    expect(visualBody.fragment.context.locator).toEqual({ type: 'image', assetId: 'asset_fix1' })

    // Rejection cases land on the expected stable error codes.
    const rejections = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'fragment-put-rejections.json'), 'utf8')) as Array<{
      name: string
      expectedCode: string
      body: { fragment: Record<string, unknown> }
    }>
    expect(rejections.length).toBeGreaterThanOrEqual(6)
    for (const rejection of rejections) {
      const result = validateFragment(withReview(rejection.body.fragment as unknown as ReturnType<typeof toFragmentWire>))
      expect(result.ok, rejection.name).toBe(false)
      expect(result.code, rejection.name).toBe(rejection.expectedCode)
    }

    // The review wording Desktop shows (both languages) is the table in review.ts.
    expect(JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'review-questions.json'), 'utf8'))).toEqual(JSON.parse(JSON.stringify(REVIEW_QUESTIONS)))

    // Asset bytes hash to the recorded digest.
    const png = new Uint8Array(readFileSync(resolve(FIXTURE_DIR, 'asset.png')))
    const assetMeta = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'asset-meta.json'), 'utf8')) as { sha256: string; byteLength: number; width: number; height: number }
    expect(png.length).toBe(assetMeta.byteLength)
    expect(await sha256Hex(png)).toBe(assetMeta.sha256)
    expect(png[0]).toBe(0x89)
    expect(png[1]).toBe(0x50)
  })
})
