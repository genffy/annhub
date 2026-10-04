/**
 * Capture-context extraction — turns a DOM selection into the L1 context
 * fields (excerpt containing the content, source url/host, kind suggestion).
 * Pure helpers live here so they are unit-testable; the Range glue is thin.
 *
 * Contract: docs/v2/fragments.md §7 (excerpt must contain the content;
 * overlong excerpts truncate from the content position outward — never from
 * the head). Kind inference is only a default — the user can always correct it
 * (extension PRD §4.3).
 */
import { normalizeHost } from '../../../learning-core/normalize'
import type { FragmentKind, FragmentLocator } from '../../../learning-core/types'

export type TextFragmentKind = Exclude<FragmentKind, 'visual' | 'media-clip'>

export interface CaptureDraft {
  draftId: string
  content: string
  excerpt: string
  sourceUrl: string
  sourceHost: string
  sourceTitle: string
  locator: FragmentLocator
  /** Structure/keyword-based default; UI must allow correction. */
  suggestedKind: TextFragmentKind
}

const SENTENCE_END = /[.!?。！？]/
const EXCERPT_MAX = 2000

/** Expand [start, end) inside `text` to sentence boundaries, trimmed. */
export function extractSentenceAround(text: string, start: number, end: number): string {
  let s = Math.max(0, Math.min(start, text.length))
  let e = Math.max(s, Math.min(end, text.length))

  while (s > 0 && !SENTENCE_END.test(text[s - 1] ?? '')) s--
  // Skip the sentence-ending punctuation + following whitespace of the previous sentence.
  while (s < text.length && /\s/.test(text[s])) s++

  while (e < text.length && !SENTENCE_END.test(text[e] ?? '')) e++
  if (e < text.length) e++ // include the terminator

  return text.slice(s, e).replace(/\s+/g, ' ').trim()
}

/**
 * Excerpt cap: truncate from the content position outward (a head truncation
 * could cut the content itself out of the excerpt — fragments.md §7).
 */
export function truncateAround(excerpt: string, content: string, max: number = EXCERPT_MAX): string {
  if (excerpt.length <= max) return excerpt
  const idx = excerpt.toLowerCase().indexOf(content.toLowerCase())
  const center = idx === -1 ? Math.floor(max / 2) : idx + Math.floor(content.length / 2)
  let start = Math.max(0, center - Math.floor(max / 2))
  let end = start + max
  if (end > excerpt.length) {
    end = excerpt.length
    start = Math.max(0, end - max)
  }
  return excerpt.slice(start, end).trim()
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Splits a context excerpt around the selected content so the verification
 * card can highlight the selection and fade the surrounding sentences.
 * Null when the content no longer appears (the user edited one of them).
 */
export function splitExcerpt(excerpt: string, content: string): { before: string; match: string; after: string } | null {
  const needle = content.trim()
  if (!needle) return null
  const found = new RegExp(escapeRegExp(needle), 'i').exec(excerpt)
  if (!found) return null
  return { before: excerpt.slice(0, found.index), match: found[0], after: excerpt.slice(found.index + found[0].length) }
}

const KIND_SIGNALS: Array<{ kind: TextFragmentKind; test: RegExp }> = [
  { kind: 'question', test: /\uFF1F|\?|是否|how (does|do|can)|why (is|do|does|are|would|should)|what (is|are|causes)/i },
  { kind: 'procedure', test: /步骤|流程|第一步|首先.*(然后|其次)|how to |step \d|checklist|算法|流程图/i },
  { kind: 'decision', test: /决定|决策|取舍|选择了|chose|decided to|trade-?off|instead of|备选/i },
  { kind: 'claim', test: /认为|主张|argue[sd]?|claim[sd]?|holds that|suggests that|in my view|作者认为/i },
  { kind: 'concept', test: /定义|是指|术语|is (defined|called) (as|a)|refers to|the concept of/i },
]

/** Keyword/structure-based default kind; `excerpt` first (definitions live in prose around the content). */
export function inferKind(content: string, excerpt: string): TextFragmentKind {
  const haystack = `${excerpt}\n${content}`
  for (const signal of KIND_SIGNALS) {
    if (signal.test.test(content) || signal.test.test(haystack)) return signal.kind
  }
  return 'excerpt'
}

let draftCounter = 0
const nextDraftId = (): string => `d${Date.now().toString(36)}${(draftCounter++).toString(36)}`

export function buildCaptureDraft(input: {
  content: string
  containerText: string
  selectionStart: number
  selectionEnd: number
  sourceUrl: string
  sourceTitle: string
}): CaptureDraft {
  const content = input.content.trim()
  const rawExcerpt = extractSentenceAround(input.containerText, input.selectionStart, input.selectionEnd)
  const excerpt = truncateAround(rawExcerpt || content, content)
  const sourceHost = normalizeHost(input.sourceUrl)
  return {
    draftId: nextDraftId(),
    content,
    excerpt,
    sourceUrl: input.sourceUrl,
    sourceHost,
    sourceTitle: input.sourceTitle.slice(0, 300),
    locator: { type: 'none' },
    suggestedKind: inferKind(content, excerpt),
  }
}

/** Manual inspiration drafts have no web selection — local source, user fills in everything (extension PRD §2.2). */
export function buildInspirationDraft(): CaptureDraft {
  return {
    draftId: nextDraftId(),
    content: '',
    excerpt: '',
    sourceUrl: 'annhub://manual/local',
    sourceHost: 'manual',
    sourceTitle: '',
    locator: { type: 'none' },
    suggestedKind: 'inspiration',
  }
}
