/**
 * Runtime validation — the gatekeeper for the `detail` weak-typing boundary.
 * Target contract: docs/v2/fragments.md §7 (validation order) and §4 (details).
 *
 * Order (first failure returns, no silent corrections):
 *   kind registered → base field ranges → normalizedContent consistent →
 *   excerpt contains content → processing.verified confirmed →
 *   processing.use non-empty → detail per kind.
 *
 * No fixed per-language token thresholds: `use` only needs to be non-empty
 * and not copy content/excerpt (processing.md §4).
 */
import type { DetailOf, FragmentKind, FragmentLocator, FragmentRecord, VerifiedResult } from './types'
import { ENABLED_FRAGMENT_KINDS, REGISTERED_FRAGMENT_KINDS } from './types'
import { normalizeContent, normalizeHost } from './normalize'

export type FragmentErrorCode =
  | 'SCHEMA_VERSION_UNSUPPORTED'
  | 'KIND_NOT_REGISTERED'
  | 'KIND_NOT_IMPLEMENTED'
  | 'CONTENT_REQUIRED'
  | 'CONTENT_TOO_LONG'
  | 'TEXT_CONTROL_CHARS'
  | 'CAPTURE_REVISION_INVALID'
  | 'SOURCE_URL_INVALID'
  | 'SOURCE_HOST_MISMATCH'
  | 'SOURCE_TITLE_TOO_LONG'
  | 'TAG_INVALID'
  | 'TAGS_TOO_MANY'
  | 'GUESS_TOO_LONG'
  | 'NORMALIZED_MISMATCH'
  | 'EXCERPT_REQUIRED'
  | 'EXCERPT_TOO_LONG'
  | 'EXCERPT_MISSING_CONTENT'
  | 'LOCATOR_INVALID'
  | 'TIMESTAMP_INVALID'
  | 'VERIFIED_REQUIRED'
  | 'VERIFIED_SOURCE_INVALID'
  | 'VERIFIED_LLM_META_REQUIRED'
  | 'VERIFIED_BASED_ON_MODEL_INVALID'
  | 'VERIFIED_SUMMARY_TOO_LONG'
  | 'VERIFIED_NOTES_TOO_LONG'
  | 'VERIFIED_REFERENCES_TOO_MANY'
  | 'VERIFIED_REFERENCE_TOO_LONG'
  | 'USE_REQUIRED'
  | 'USE_TOO_LONG'
  | 'USE_COPIES_CONTENT'
  | 'USE_COPIES_EXCERPT'
  | 'DETAIL_KIND_MISMATCH'
  | 'DETAIL_FIELD_INVALID'
  | 'PROCEDURE_STEPS_REQUIRED'
  | 'DECISION_RATIONALE_REQUIRED'
  | 'QUESTION_STATUS_INVALID'
  | 'QUESTION_ANSWER_REQUIRED'
  | 'QUESTION_HYPOTHESIS_REQUIRED'
  | 'VISUAL_ATTACHMENT_REQUIRED'
  | 'INSPIRATION_FORM_INVALID'

export interface ValidationResult {
  ok: boolean
  code?: FragmentErrorCode
  /** Human-actionable context (e.g. got/max counts). UI shows messages, not raw errors. */
  info?: Record<string, unknown>
}

export const ok = (): ValidationResult => ({ ok: true })
export const fail = (code: FragmentErrorCode, info?: Record<string, unknown>): ValidationResult => ({ ok: false, code, info })

// ── shared text guards ──────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex -- rejecting C0 control characters is the point
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

/**
 * Free-text fields must not carry C0 control characters (tab/newline/CR
 * excluded) or lone surrogates: they cannot round-trip through UTF-8 and
 * would break byte-stable JSON (export, hashing).
 */
export function textIsCanonicalSafe(text: string): boolean {
  if (CONTROLS.test(text)) return false
  // Lone surrogates cannot be encoded as UTF-8 — reject before hashing.
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false
    }
  }
  return true
}

function checkText(text: unknown, field: string, max: number): ValidationResult | null {
  if (text === undefined || text === null) return null
  if (typeof text !== 'string') return fail('DETAIL_FIELD_INVALID', { field })
  if (!textIsCanonicalSafe(text)) return fail('TEXT_CONTROL_CHARS', { field })
  if (text.length > max) return fail('DETAIL_FIELD_INVALID', { field, got: text.length, max })
  return null
}

function checkStringList(list: unknown, field: string, maxItems: number, maxItem: number): ValidationResult | null {
  if (list === undefined) return null
  if (!Array.isArray(list)) return fail('DETAIL_FIELD_INVALID', { field })
  if (list.length > maxItems) return fail('DETAIL_FIELD_INVALID', { field, got: list.length, max: maxItems })
  for (const item of list) {
    if (typeof item !== 'string' || !item.trim()) return fail('DETAIL_FIELD_INVALID', { field })
    const text = checkText(item, field, maxItem)
    if (text) return text
  }
  return null
}

function isFiniteEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Media time ranges start at zero (fragments.md §5: 0 <= startMs < endMs). */
function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

// ── locator (fragments.md §5) ────────────────────────────────────────────

function validateRect(rect: unknown): boolean {
  if (!Array.isArray(rect) || rect.length !== 4) return false
  if (!rect.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return false
  const [x, y, w, h] = rect
  return w > 0 && h > 0 && x + w <= 1 && y + h <= 1
}

export function validateLocator(locator: unknown): ValidationResult {
  const l = locator as Partial<FragmentLocator> | null
  if (!l || typeof l !== 'object') return fail('LOCATOR_INVALID')
  switch (l.type) {
    case 'none':
      return ok()
    case 'dom':
      if (typeof l.selector !== 'string' || !l.selector.trim() || l.selector.length > 2000) return fail('LOCATOR_INVALID')
      if (l.textOffset !== undefined && !isNonNegativeInt(l.textOffset)) return fail('LOCATOR_INVALID')
      return ok()
    case 'image': {
      if (typeof l.assetId !== 'string' || !l.assetId.trim() || l.assetId.length > 64) return fail('LOCATOR_INVALID')
      if (l.rect !== undefined && !validateRect(l.rect)) return fail('LOCATOR_INVALID')
      return ok()
    }
    case 'time':
      if (!isFiniteNonNegative(l.startMs) || !isFiniteEpoch(l.endMs) || l.startMs >= l.endMs) return fail('LOCATOR_INVALID')
      return ok()
    case 'page':
      if (!Number.isInteger(l.pageNumber) || (l.pageNumber as number) < 1) return fail('LOCATOR_INVALID')
      if (l.rect !== undefined && !validateRect(l.rect)) return fail('LOCATOR_INVALID')
      return ok()
    default:
      return fail('LOCATOR_INVALID')
  }
}

// ── source URL / host pairing (fragments.md §7) ─────────────────────────

const ANNHUB_LOCAL_ID = /^[A-Za-z0-9_-]+$/

export function validateSourcePair(sourceUrl: string, sourceHost: string): ValidationResult {
  if (typeof sourceUrl !== 'string' || !sourceUrl.trim()) return fail('SOURCE_URL_INVALID')
  if (sourceUrl.startsWith('annhub://manual/')) {
    const id = sourceUrl.slice('annhub://manual/'.length)
    if (!ANNHUB_LOCAL_ID.test(id)) return fail('SOURCE_URL_INVALID')
    if (sourceHost !== 'manual') return fail('SOURCE_HOST_MISMATCH', { got: sourceHost, need: 'manual' })
    return ok()
  }
  let url: URL
  try {
    url = new URL(sourceUrl)
  } catch {
    return fail('SOURCE_URL_INVALID')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail('SOURCE_URL_INVALID')
  if (!url.hostname) return fail('SOURCE_URL_INVALID')
  if (sourceHost !== normalizeHost(sourceUrl)) {
    return fail('SOURCE_HOST_MISMATCH', { got: sourceHost, need: normalizeHost(sourceUrl) })
  }
  return ok()
}

// ── verification (fragments.md §3/§7) ───────────────────────────────────

export function validateVerified(verified: unknown): ValidationResult {
  const v = verified as Partial<VerifiedResult> | null
  if (!v || typeof v !== 'object') return fail('VERIFIED_REQUIRED')
  if (!isFiniteEpoch(v.confirmedAt)) return fail('VERIFIED_REQUIRED', { field: 'confirmedAt' })
  if (v.source !== 'source-material' && v.source !== 'llm' && v.source !== 'manual') {
    return fail('VERIFIED_SOURCE_INVALID')
  }
  const summary = checkText(v.summary, 'verified.summary', 5000)
  if (summary) return summary
  const notes = checkText(v.notes, 'verified.notes', 5000)
  if (notes) return notes
  if (v.references !== undefined) {
    const refs = checkStringList(v.references, 'verified.references', 10, 500)
    if (refs) return refs
  }
  if (v.source === 'llm') {
    if (typeof v.modelId !== 'string' || !v.modelId.trim() || typeof v.promptVersion !== 'string' || !v.promptVersion.trim()) {
      return fail('VERIFIED_LLM_META_REQUIRED')
    }
    if (v.basedOnModel !== undefined) return fail('VERIFIED_BASED_ON_MODEL_INVALID')
  }
  if (v.modelId !== undefined && v.modelId.length > 200) return fail('DETAIL_FIELD_INVALID', { field: 'verified.modelId' })
  if (v.promptVersion !== undefined && v.promptVersion.length > 200) {
    return fail('DETAIL_FIELD_INVALID', { field: 'verified.promptVersion' })
  }
  if (v.basedOnModel !== undefined) {
    if (v.source === 'llm') return fail('VERIFIED_BASED_ON_MODEL_INVALID')
    const b = v.basedOnModel
    if (!b || typeof b !== 'object' || typeof b.modelId !== 'string' || !b.modelId.trim() || typeof b.promptVersion !== 'string' || !b.promptVersion.trim()) {
      return fail('VERIFIED_BASED_ON_MODEL_INVALID')
    }
  }
  return ok()
}

// ── per-kind detail validators (fragments.md §4/§7) ─────────────────────

type DetailValidator = (detail: unknown) => ValidationResult

const validateExcerptDetail: DetailValidator = d => {
  const x = d as { note?: unknown } | null
  if (!x || typeof x !== 'object') return fail('DETAIL_KIND_MISMATCH', { kind: 'excerpt' })
  const note = checkText(x.note, 'detail.note', 2000)
  if (note) return note
  return ok()
}

const validateConceptDetail: DetailValidator = d => {
  const x = d as { definition?: unknown; boundaries?: unknown; examples?: unknown; counterExamples?: unknown } | null
  if (!x || typeof x !== 'object') return fail('DETAIL_KIND_MISMATCH', { kind: 'concept' })
  const definition = checkText(x.definition, 'detail.definition', 2000)
  if (definition) return definition
  for (const field of ['boundaries', 'examples', 'counterExamples'] as const) {
    const list = checkStringList(x[field], `detail.${field}`, 20, 500)
    if (list) return list
  }
  return ok()
}

const validateClaimDetail: DetailValidator = d => {
  const x = d as { stance?: unknown; evidence?: unknown; assumptions?: unknown } | null
  if (!x || typeof x !== 'object') return fail('DETAIL_KIND_MISMATCH', { kind: 'claim' })
  if (x.stance !== undefined && x.stance !== 'support' && x.stance !== 'oppose' && x.stance !== 'uncertain') {
    return fail('DETAIL_FIELD_INVALID', { field: 'detail.stance' })
  }
  for (const field of ['evidence', 'assumptions'] as const) {
    const list = checkStringList(x[field], `detail.${field}`, 20, 500)
    if (list) return list
  }
  return ok()
}

const validateProcedureDetail: DetailValidator = d => {
  const x = d as { steps?: unknown; prerequisites?: unknown; failureModes?: unknown } | null
  if (!x || typeof x !== 'object') return fail('DETAIL_KIND_MISMATCH', { kind: 'procedure' })
  if (!Array.isArray(x.steps) || x.steps.length === 0) return fail('PROCEDURE_STEPS_REQUIRED')
  const steps = checkStringList(x.steps, 'detail.steps', 20, 500)
  if (steps) return steps
  for (const field of ['prerequisites', 'failureModes'] as const) {
    const list = checkStringList(x[field], `detail.${field}`, 20, 500)
    if (list) return list
  }
  return ok()
}

const validateDecisionDetail: DetailValidator = d => {
  const x = d as { rationale?: unknown; alternatives?: unknown; consequences?: unknown } | null
  if (!x || typeof x !== 'object') return fail('DETAIL_KIND_MISMATCH', { kind: 'decision' })
  if (typeof x.rationale !== 'string' || !x.rationale.trim()) return fail('DECISION_RATIONALE_REQUIRED')
  const rationale = checkText(x.rationale, 'detail.rationale', 2000)
  if (rationale) return rationale
  for (const field of ['alternatives', 'consequences'] as const) {
    const list = checkStringList(x[field], `detail.${field}`, 20, 500)
    if (list) return list
  }
  return ok()
}

const validateQuestionDetail: DetailValidator = d => {
  const x = d as { status?: unknown; hypothesis?: unknown; evidence?: unknown; nextStep?: unknown; answer?: unknown } | null
  if (!x || typeof x !== 'object') return fail('DETAIL_KIND_MISMATCH', { kind: 'question' })
  if (x.status !== 'open' && x.status !== 'testing' && x.status !== 'answered') return fail('QUESTION_STATUS_INVALID')
  const hypothesis = checkText(x.hypothesis, 'detail.hypothesis', 2000)
  if (hypothesis) return hypothesis
  const nextStep = checkText(x.nextStep, 'detail.nextStep', 2000)
  if (nextStep) return nextStep
  const answer = checkText(x.answer, 'detail.answer', 2000)
  if (answer) return answer
  const evidence = checkStringList(x.evidence, 'detail.evidence', 20, 500)
  if (evidence) return evidence
  if (x.status === 'answered' && (typeof x.answer !== 'string' || !x.answer.trim())) {
    return fail('QUESTION_ANSWER_REQUIRED')
  }
  if (x.status !== 'answered') {
    const hasHypothesis = typeof x.hypothesis === 'string' && x.hypothesis.trim()
    const hasNextStep = typeof x.nextStep === 'string' && x.nextStep.trim()
    if (!hasHypothesis && !hasNextStep) return fail('QUESTION_HYPOTHESIS_REQUIRED')
  }
  return ok()
}

export function validateAttachmentIds(ids: unknown): ValidationResult {
  if (!Array.isArray(ids) || ids.length === 0) return fail('VISUAL_ATTACHMENT_REQUIRED')
  if (ids.length > 10) return fail('DETAIL_FIELD_INVALID', { field: 'detail.attachmentIds', got: ids.length, max: 10 })
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim() || id.length > 64) return fail('DETAIL_FIELD_INVALID', { field: 'detail.attachmentIds' })
    if (seen.has(id)) return fail('DETAIL_FIELD_INVALID', { field: 'detail.attachmentIds', duplicate: id })
    seen.add(id)
  }
  return ok()
}

const validateVisualDetail: DetailValidator = d => {
  const x = d as { attachmentIds?: unknown } | null
  if (!x || typeof x !== 'object') return fail('DETAIL_KIND_MISMATCH', { kind: 'visual' })
  return validateAttachmentIds(x.attachmentIds)
}

const validateMediaClipDetail: DetailValidator = d => {
  const x = d as { startMs?: unknown; endMs?: unknown; attachmentIds?: unknown } | null
  if (!x || typeof x !== 'object') return fail('DETAIL_KIND_MISMATCH', { kind: 'media-clip' })
  if (!isFiniteNonNegative(x.startMs) || !isFiniteEpoch(x.endMs) || (x.startMs as number) >= (x.endMs as number)) {
    return fail('DETAIL_FIELD_INVALID', { field: 'detail.startMs/endMs', need: '0 <= startMs < endMs' })
  }
  if (x.attachmentIds !== undefined) {
    const attachments = validateAttachmentIds(x.attachmentIds)
    if (!attachments.ok) return attachments
  }
  return ok()
}

const validateInspirationDetail: DetailValidator = d => {
  const x = d as { form?: unknown } | null
  if (!x || typeof x !== 'object') return fail('DETAIL_KIND_MISMATCH', { kind: 'inspiration' })
  if (x.form !== 'idea' && x.form !== 'reflection') return fail('INSPIRATION_FORM_INVALID')
  return ok()
}

/** Registry of per-kind detail validators — every registered kind is enabled (fragments.md §4). */
export const FRAGMENT_DETAIL_VALIDATORS: Partial<Record<FragmentKind, DetailValidator>> = {
  'excerpt': validateExcerptDetail,
  'concept': validateConceptDetail,
  'claim': validateClaimDetail,
  'procedure': validateProcedureDetail,
  'decision': validateDecisionDetail,
  'question': validateQuestionDetail,
  'visual': validateVisualDetail,
  'media-clip': validateMediaClipDetail,
  'inspiration': validateInspirationDetail,
}

export const isKindEnabled = (kind: string): boolean => (ENABLED_FRAGMENT_KINDS as readonly string[]).includes(kind)

// ── base field ranges ───────────────────────────────────────────────────

function validateBaseFields(f: FragmentRecord): ValidationResult {
  if (f.schemaVersion !== 4) return fail('SCHEMA_VERSION_UNSUPPORTED', { got: f.schemaVersion, need: 4 })
  if (typeof f.id !== 'string' || !f.id.trim()) return fail('DETAIL_FIELD_INVALID', { field: 'id' })
  if (!Number.isInteger(f.captureRevision) || f.captureRevision < 1) return fail('CAPTURE_REVISION_INVALID')

  const content = f.content.trim()
  if (!content) return fail('CONTENT_REQUIRED')
  if (f.content.length > 500) return fail('CONTENT_TOO_LONG', { got: f.content.length, max: 500 })
  if (!textIsCanonicalSafe(f.content)) return fail('TEXT_CONTROL_CHARS', { field: 'content' })

  const source = validateSourcePair(f.context.sourceUrl, f.context.sourceHost)
  if (!source.ok) return source
  if (f.context.sourceTitle !== undefined) {
    const title = checkText(f.context.sourceTitle, 'context.sourceTitle', 300)
    if (title) return title
  }
  if (!Array.isArray(f.tags)) return fail('TAG_INVALID')
  for (const tag of f.tags) {
    if (typeof tag !== 'string' || tag.length < 1 || tag.length > 32) return fail('TAG_INVALID', { tag })
  }
  if (f.tags.length > 20) return fail('TAGS_TOO_MANY', { got: f.tags.length, max: 20 })
  if (f.processing.guess !== undefined) {
    const guess = checkText(f.processing.guess, 'processing.guess', 5000)
    if (guess) return guess
  }
  if (!isFiniteEpoch(f.context.capturedAt) || !isFiniteEpoch(f.createdAt) || !isFiniteEpoch(f.updatedAt)) {
    return fail('TIMESTAMP_INVALID')
  }
  return ok()
}

/** Full validation in the mandated order (fragments.md §7). */
export function validateFragment(f: FragmentRecord): ValidationResult {
  if (!(REGISTERED_FRAGMENT_KINDS as readonly string[]).includes(f.kind)) {
    return fail('KIND_NOT_REGISTERED', { kind: f.kind })
  }
  const detailValidator = FRAGMENT_DETAIL_VALIDATORS[f.kind]
  if (!detailValidator) return fail('KIND_NOT_IMPLEMENTED', { kind: f.kind })

  const base = validateBaseFields(f)
  if (!base.ok) return base

  if (f.normalizedContent !== normalizeContent(f.content)) return fail('NORMALIZED_MISMATCH')

  const excerpt = f.context.excerpt
  if (typeof excerpt !== 'string' || !excerpt.trim()) return fail('EXCERPT_REQUIRED')
  if (excerpt.length > 2000) return fail('EXCERPT_TOO_LONG', { got: excerpt.length, max: 2000 })
  if (!textIsCanonicalSafe(excerpt)) return fail('TEXT_CONTROL_CHARS', { field: 'context.excerpt' })
  if (!normalizeContent(excerpt).includes(f.normalizedContent)) return fail('EXCERPT_MISSING_CONTENT')

  const locator = validateLocator(f.context.locator)
  if (!locator.ok) return locator

  const verified = validateVerified(f.processing?.verified)
  if (!verified.ok) return verified

  const use = f.processing?.use
  if (typeof use !== 'string' || !use.trim()) return fail('USE_REQUIRED')
  if (use.length > 5000) return fail('USE_TOO_LONG', { got: use.length, max: 5000 })
  if (!textIsCanonicalSafe(use)) return fail('TEXT_CONTROL_CHARS', { field: 'processing.use' })
  if (use.trim() === f.content.trim()) return fail('USE_COPIES_CONTENT')
  if (use.trim() === excerpt.trim()) return fail('USE_COPIES_EXCERPT')

  return detailValidator(f.detail)
}

export class FragmentValidationError extends Error {
  constructor(
    public readonly code: FragmentErrorCode,
    public readonly info?: Record<string, unknown>,
  ) {
    super(`Fragment validation failed: ${code}`)
    this.name = 'FragmentValidationError'
  }
}

/** Throws on invalid — used inside the shared factory so callers cannot bypass validation. */
export function assertValid(f: FragmentRecord): void {
  const result = validateFragment(f)
  if (!result.ok) throw new FragmentValidationError(result.code!, result.info)
}

// ── detail typing helper ─────────────────────────────────────────────────

export function assertDetailKind<K extends FragmentKind>(kind: K, detail: DetailOf<K>): void {
  const validator = FRAGMENT_DETAIL_VALIDATORS[kind]
  if (!validator) throw new FragmentValidationError('KIND_NOT_IMPLEMENTED', { kind })
  const result = validator(detail)
  if (!result.ok) throw new FragmentValidationError(result.code!, result.info)
}
