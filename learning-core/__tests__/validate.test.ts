import { describe, expect, it } from 'vitest'
import { createFragment } from '../factory'
import {
  validateFragment,
  validateVerified,
} from '../validate'
import type { FragmentRecord } from '../types'
import { makeFragment, makeFragmentOf, VERIFIED, EXCERPT } from './helpers'

describe('kind registry (fragments.md §4)', () => {
  it('accepts all seven text kinds plus visual', () => {
    for (const kind of ['excerpt', 'concept', 'claim', 'procedure', 'decision', 'question', 'inspiration', 'visual'] as const) {
      const f = makeFragmentOf(kind)
      expect(validateFragment(f).ok, kind).toBe(true)
    }
  })

  it('rejects unregistered kinds first', () => {
    const f = { ...makeFragment(), kind: 'diary' } as unknown as FragmentRecord
    const result = validateFragment(f)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('KIND_NOT_REGISTERED')
  })

  it('accepts media-clip with an increasing time range; rejects bad ranges', () => {
    const base = makeFragment()
    const media = {
      ...base,
      kind: 'media-clip',
      content: '主持人总结了三条要点',
      normalizedContent: '主持人总结了三条要点',
      context: { ...base.context, excerpt: '主持人总结了三条要点（00:12–00:45 的转写节选）', locator: { type: 'time' as const, startMs: 12_000, endMs: 45_000 } },
      detail: { startMs: 12_000, endMs: 45_000 },
    } as unknown as FragmentRecord
    expect(validateFragment(media).ok).toBe(true)
    // 0 <= startMs is contract-legal (media from the very beginning)
    expect(validateFragment({ ...media, detail: { startMs: 0, endMs: 45_000 }, context: { ...media.context, locator: { type: 'time' as const, startMs: 0, endMs: 45_000 } } }).ok).toBe(true)
    expect(validateFragment({ ...media, detail: { startMs: 45_000, endMs: 45_000 } }).code).toBe('DETAIL_FIELD_INVALID')
  })

  it('rejects schema versions other than 4', () => {
    const f = { ...makeFragment(), schemaVersion: 3 } as unknown as FragmentRecord
    expect(validateFragment(f).code).toBe('SCHEMA_VERSION_UNSUPPORTED')
  })
})

describe('generic field rules (fragments.md §7)', () => {
  it('requires non-empty trimmed content within 500 chars', () => {
    expect(validateFragment({ ...makeFragment(), content: '   ' }).code).toBe('CONTENT_REQUIRED')
    expect(validateFragment({ ...makeFragment(), content: 'x'.repeat(501) }).code).toBe('CONTENT_TOO_LONG')
  })

  it('rejects C0 control characters that would break cross-end hashing', () => {
    const f = makeFragment()
    const bad = { ...f, content: `bad${String.fromCharCode(3)}content`, excerpt: EXCERPT + ' bad' }
    expect(validateFragment(bad).code).toBe('TEXT_CONTROL_CHARS')
  })

  it('requires integer captureRevision >= 1', () => {
    expect(validateFragment({ ...makeFragment(), captureRevision: 0 }).code).toBe('CAPTURE_REVISION_INVALID')
  })

  it('accepts http(s) sources and both annhub:// local schemes with matching hosts', () => {
    expect(validateFragment(makeFragmentOf('concept', { sourceUrl: 'https://example.com/a', sourceHost: 'example.com' })).ok).toBe(true)
    expect(validateFragment(makeFragmentOf('inspiration', { sourceUrl: 'annhub://manual/frag_1', sourceHost: 'manual' })).ok).toBe(true)
  })

  it('rejects scheme/host mismatches', () => {
    const manual = makeFragmentOf('inspiration', { sourceUrl: 'annhub://manual/frag_1', sourceHost: 'manual' })
    const manualHostMismatch = { ...manual, context: { ...manual.context, sourceHost: 'example.com' } }
    expect(validateFragment(manualHostMismatch).code).toBe('SOURCE_HOST_MISMATCH')

    const web = makeFragmentOf('concept', { sourceUrl: 'https://example.com/a', sourceHost: 'example.com' })
    const webHostMismatch = { ...web, context: { ...web.context, sourceHost: 'other.com' } }
    expect(validateFragment(webHostMismatch).code).toBe('SOURCE_HOST_MISMATCH')

    const base = makeFragment()
    const badScheme = { ...base, context: { ...base.context, sourceUrl: 'ftp://example.com/a', sourceHost: 'example.com' } }
    expect(validateFragment(badScheme).code).toBe('SOURCE_URL_INVALID')
  })

  it('keeps normalizedContent consistent and excerpt containing content', () => {
    expect(validateFragment({ ...makeFragment(), normalizedContent: 'wrong' }).code).toBe('NORMALIZED_MISMATCH')
    const missing = makeFragment()
    const out = { ...missing, context: { ...missing.context, excerpt: 'unrelated text entirely' } }
    expect(validateFragment(out).code).toBe('EXCERPT_MISSING_CONTENT')
  })

  it('caps tags at 20 entries of 1..32 chars', () => {
    expect(validateFragment({ ...makeFragment(), tags: Array(21).fill('t') }).code).toBe('TAGS_TOO_MANY')
    expect(validateFragment({ ...makeFragment(), tags: ['x'.repeat(33)] }).code).toBe('TAG_INVALID')
  })
})

describe('verification (fragments.md §3/§7)', () => {
  it('requires an explicit confirmation with finite time and legal source', () => {
    expect(validateVerified(undefined).code).toBe('VERIFIED_REQUIRED')
    expect(validateVerified({ ...VERIFIED, confirmedAt: Number.NaN }).code).toBe('VERIFIED_REQUIRED')
    expect(validateVerified({ ...VERIFIED, source: 'gut-feeling' }).code).toBe('VERIFIED_SOURCE_INVALID')
  })

  it('demands modelId + promptVersion for llm results and forbids basedOnModel there', () => {
    expect(validateVerified({ ...VERIFIED, source: 'llm' }).code).toBe('VERIFIED_LLM_META_REQUIRED')
    expect(
      validateVerified({ ...VERIFIED, source: 'llm', modelId: 'gpt-x', promptVersion: 'p1', basedOnModel: { modelId: 'gpt-x', promptVersion: 'p0' } }).code,
    ).toBe('VERIFIED_BASED_ON_MODEL_INVALID')
    expect(validateVerified({ ...VERIFIED, source: 'llm', modelId: 'gpt-x', promptVersion: 'p1' }).ok).toBe(true)
  })

  it('keeps basedOnModel for edited model suggestions recorded as manual', () => {
    expect(validateVerified({ ...VERIFIED, source: 'manual', basedOnModel: { modelId: 'gpt-x', promptVersion: 'p0' } }).ok).toBe(true)
  })

  it('fails fragment validation when verification is missing', () => {
    const f = makeFragment()
    const unverified = { ...f, processing: { ...f.processing, verified: undefined as unknown as FragmentRecord['processing']['verified'] } }
    expect(validateFragment(unverified).code).toBe('VERIFIED_REQUIRED')
  })
})

describe('generic application gate (processing.md §4 — no language token thresholds)', () => {
  it('accepts a short Chinese use sentence', () => {
    const f = makeFragmentOf('concept')
    expect(f.processing.use).toBe('用在下周的复盘文章里。')
    expect(validateFragment(f).ok).toBe(true)
  })

  it('rejects empty use and copies of content/excerpt', () => {
    const base = makeFragment()
    expect(validateFragment({ ...base, processing: { ...base.processing, use: '  ' } }).code).toBe('USE_REQUIRED')
    expect(validateFragment({ ...base, processing: { ...base.processing, use: base.content } }).code).toBe('USE_COPIES_CONTENT')
    expect(validateFragment({ ...base, processing: { ...base.processing, use: base.context.excerpt } }).code).toBe('USE_COPIES_EXCERPT')
  })
})

describe('locators (fragments.md §5)', () => {
  it('validates normalized image rects', () => {
    const okImage = makeFragmentOf('visual')
    expect(validateFragment(okImage).ok).toBe(true)

    const outOfBounds = makeFragmentOf('visual')
    const bad = { ...outOfBounds, context: { ...outOfBounds.context, locator: { type: 'image' as const, assetId: 'asset_fix1', rect: [0.5, 0.5, 0.8, 0.2] as [number, number, number, number] } } }
    expect(validateFragment(bad).code).toBe('LOCATOR_INVALID')

    const zeroSize = makeFragmentOf('visual')
    const badZero = { ...zeroSize, context: { ...zeroSize.context, locator: { type: 'image' as const, assetId: 'asset_fix1', rect: [0.1, 0.1, 0, 0.5] as [number, number, number, number] } } }
    expect(validateFragment(badZero).code).toBe('LOCATOR_INVALID')
  })

  it('requires increasing time ranges and positive page numbers', () => {
    const timeBad = makeFragment()
    const t = { ...timeBad, context: { ...timeBad.context, locator: { type: 'time' as const, startMs: 5000, endMs: 5000 } } }
    expect(validateFragment(t).code).toBe('LOCATOR_INVALID')

    const pageBad = makeFragment()
    const p = { ...pageBad, context: { ...pageBad.context, locator: { type: 'page' as const, pageNumber: 0 } } }
    expect(validateFragment(p).code).toBe('LOCATOR_INVALID')
  })
})

describe('per-kind detail validators (fragments.md §4)', () => {
  it('procedure needs at least one step', () => {
    const f = makeFragmentOf('procedure')
    expect(validateFragment({ ...f, detail: { ...f.detail, steps: [] } }).code).toBe('PROCEDURE_STEPS_REQUIRED')
  })

  it('decision needs non-empty rationale', () => {
    const f = makeFragmentOf('decision')
    expect(validateFragment({ ...f, detail: { ...f.detail, rationale: '' } }).code).toBe('DECISION_RATIONALE_REQUIRED')
  })

  it('question: answered needs answer, otherwise hypothesis or nextStep', () => {
    const f = makeFragmentOf('question')
    expect(validateFragment({ ...f, detail: { ...f.detail, status: 'answered' } }).code).toBe('QUESTION_ANSWER_REQUIRED')
    const noPath = { ...f, detail: { status: 'open' as const } }
    expect(validateFragment(noPath).code).toBe('QUESTION_HYPOTHESIS_REQUIRED')
    expect(validateFragment({ ...f, detail: { status: 'answered' as const, answer: '结论：部分迁移', hypothesis: 'x' } }).ok).toBe(true)
  })

  it('claim stance is optional in the data layer but must be a known value when present', () => {
    const f = makeFragmentOf('claim')
    expect(validateFragment({ ...f, detail: { ...f.detail, stance: undefined } }).ok).toBe(true)
    expect(validateFragment({ ...f, detail: { ...f.detail, stance: 'maybe' as unknown as 'support' } }).code).toBe('DETAIL_FIELD_INVALID')
  })

  it('visual requires at least one attachment id and rejects duplicates', () => {
    const f = makeFragmentOf('visual')
    expect(validateFragment({ ...f, detail: { attachmentIds: [] } }).code).toBe('VISUAL_ATTACHMENT_REQUIRED')
    expect(validateFragment({ ...f, detail: { attachmentIds: ['asset_fix1', 'asset_fix1'] } }).code).toBe('DETAIL_FIELD_INVALID')
  })

  it('inspiration form must be idea or reflection', () => {
    const f = makeFragmentOf('inspiration')
    expect(validateFragment({ ...f, detail: { form: 'rant' as unknown as 'idea' } }).code).toBe('INSPIRATION_FORM_INVALID')
  })
})

describe('factory', () => {
  it('creates v4 records with captureRevision 1 and throws on invalid input', () => {
    const f = makeFragment()
    expect(f.schemaVersion).toBe(4)
    expect(f.captureRevision).toBe(1)
    expect(() =>
      createFragment({
        kind: 'concept',
        content: 'x',
        context: {
          excerpt: 'x',
          sourceUrl: 'https://a.com/x',
          sourceHost: 'a.com',
          locator: { type: 'none' },
        },
        processing: { verified: VERIFIED, use: 'x' },
        detail: {},
      }),
    ).toThrow(/validation failed/i)
  })
})
