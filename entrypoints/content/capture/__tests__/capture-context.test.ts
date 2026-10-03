import { describe, it, expect } from 'vitest'
import { extractSentenceAround, truncateAround, inferKind, buildCaptureDraft, buildInspirationDraft } from '../capture-context'

describe('extractSentenceAround', () => {
  const text = 'Markets fell sharply. The Fed signalled a hawkish pivot on rates. Investors reacted fast.'

  it('expands to surrounding sentence boundaries', () => {
    const idx = text.indexOf('hawkish')
    expect(extractSentenceAround(text, idx, idx + 7)).toBe('The Fed signalled a hawkish pivot on rates.')
  })

  it('includes the terminator and handles the first sentence', () => {
    const idx = text.indexOf('Markets')
    expect(extractSentenceAround(text, idx, idx + 7)).toBe('Markets fell sharply.')
  })

  it('handles the last sentence without a terminator', () => {
    const idx = text.indexOf('Investors')
    expect(extractSentenceAround(text, idx, idx + 9)).toBe('Investors reacted fast.')
  })
})

describe('truncateAround', () => {
  it('keeps short excerpts untouched', () => {
    expect(truncateAround('short one', 'one', 2000)).toBe('short one')
  })

  it('truncates from the content position outward, never from the head', () => {
    const head = 'A'.repeat(1900)
    const excerpt = `${head} The Fed made a hawkish pivot today. ${'B'.repeat(200)}`
    const truncated = truncateAround(excerpt, 'hawkish pivot', 200)
    expect(truncated.length).toBeLessThanOrEqual(200)
    expect(truncated).toContain('hawkish pivot')
    expect(truncated).not.toBe(excerpt.slice(0, 200))
    expect(truncated.indexOf('hawkish')).toBeLessThanOrEqual(100)
  })
})

describe('inferKind (extension PRD §4.3: default only, user can correct)', () => {
  it('signals questions, procedures, decisions, claims and concepts', () => {
    expect(inferKind('Why does this hold?', '')).toBe('question')
    expect(inferKind('deploy', 'The checklist: how to deploy step by step')).toBe('procedure')
    expect(inferKind('use SQLite', 'We decided to use SQLite instead of CRDTs')).toBe('decision')
    expect(inferKind('rates will fall', 'The columnist argues rates will fall')).toBe('claim')
    expect(inferKind('inflation', 'Inflation is defined as a sustained rise in prices')).toBe('concept')
  })

  it('falls back to excerpt', () => {
    expect(inferKind('a plain sentence', 'some context around it')).toBe('excerpt')
  })
})

describe('buildCaptureDraft', () => {
  const base = {
    content: 'hawkish pivot',
    containerText: 'Some lead-in. The Fed signalled a hawkish pivot on rates today.',
    selectionStart: 42,
    selectionEnd: 42 + 'hawkish pivot'.length,
    sourceUrl: 'https://www.wsj.com/articles/fed?mod=hp',
    sourceTitle: 'WSJ Title',
  }

  it('assembles the L1 context with normalized host and a locator of none', () => {
    const draft = buildCaptureDraft(base)
    expect(draft.excerpt).toBe('The Fed signalled a hawkish pivot on rates today.')
    expect(draft.sourceHost).toBe('wsj.com')
    expect(draft.sourceUrl).toBe(base.sourceUrl)
    expect(draft.locator).toEqual({ type: 'none' })
    expect(draft.suggestedKind).toBe('excerpt')
    expect(draft.draftId).toBeTruthy()
  })

  it('falls back to the raw content as excerpt when the sentence extraction misses', () => {
    const draft = buildCaptureDraft({ ...base, containerText: '', selectionStart: 0, selectionEnd: 0 })
    expect(draft.excerpt).toBe('hawkish pivot')
  })
})

describe('buildInspirationDraft', () => {
  it('uses the local annhub source with no fabricated web fields', () => {
    const draft = buildInspirationDraft()
    expect(draft.sourceUrl.startsWith('annhub://manual/')).toBe(true)
    expect(draft.sourceHost).toBe('manual')
    expect(draft.suggestedKind).toBe('inspiration')
    expect(draft.content).toBe('')
  })
})
