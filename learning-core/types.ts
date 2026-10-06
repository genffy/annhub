/**
 * Learning-core type contract — single source of truth for the entities the
 * extension captures and stores locally.
 *
 * Contract owners (docs/v2):
 *   - FragmentRecord shape / kinds / validation: docs/v2/fragments.md
 *   - ImageAsset / ScreenshotRecord: docs/v2/storage.md
 *
 * This module must stay environment-neutral: no chrome.*, no DOM, no React.
 */

// ── Fragment kind registry (fragments.md §2) ────────────────────────────

/**
 * Enabled kinds: seven text kinds, basic `visual` (extension web
 * screenshots) and `media-clip` (R4: video/audio time ranges with a
 * user-written transcript — manual transcription, LLM optional).
 */
export type FragmentKind = 'excerpt' | 'concept' | 'claim' | 'procedure' | 'decision' | 'question' | 'inspiration' | 'visual' | 'media-clip'

/** Every kind that appears in the union; validation checks against this. */
export const REGISTERED_FRAGMENT_KINDS: readonly FragmentKind[] = ['excerpt', 'concept', 'claim', 'procedure', 'decision', 'question', 'inspiration', 'visual', 'media-clip']

/** Kinds whose detail validators are implemented (fragments.md §4). */
export const ENABLED_FRAGMENT_KINDS: readonly FragmentKind[] = ['excerpt', 'concept', 'claim', 'procedure', 'decision', 'question', 'inspiration', 'visual', 'media-clip']

// ── Type-specialized detail blocks (fragments.md §4) ────────────────────

export interface FragmentDetailMap {
  'excerpt': { note?: string }
  'concept': {
    definition?: string
    boundaries?: string[]
    examples?: string[]
    counterExamples?: string[]
  }
  'claim': {
    stance?: 'support' | 'oppose' | 'uncertain'
    evidence?: string[]
    assumptions?: string[]
  }
  'procedure': {
    steps: string[]
    prerequisites?: string[]
    failureModes?: string[]
  }
  'decision': {
    rationale: string
    alternatives?: string[]
    consequences?: string[]
  }
  'question': {
    status: 'open' | 'testing' | 'answered'
    hypothesis?: string
    evidence?: string[]
    nextStep?: string
    answer?: string
  }
  'visual': {
    attachmentIds: string[]
  }
  'media-clip': {
    startMs: number
    endMs: number
    attachmentIds?: string[]
  }
  'inspiration': {
    form: 'idea' | 'reflection'
  }
}

export type DetailOf<K extends FragmentKind> = K extends keyof FragmentDetailMap ? FragmentDetailMap[K] : never

// ── Verification (fragments.md §3 / processing.md §2) ───────────────────

export type VerifiedSource = 'source-material' | 'llm' | 'manual'

/**
 * The user explicitly confirmed the verification step. `confirmedAt` and
 * `source` are mandatory; summary / notes / references are optional. An
 * `llm` result must carry modelId + promptVersion; an edited model
 * suggestion becomes `manual` and keeps the original model in basedOnModel.
 */
export interface VerifiedResult {
  confirmedAt: number
  source: VerifiedSource
  summary?: string
  notes?: string
  references?: string[]
  modelId?: string
  promptVersion?: string
  basedOnModel?: { modelId: string; promptVersion: string }
}

// ── Context (L1 invariant) ──────────────────────────────────────────────

export type FragmentLocator =
  | { type: 'dom'; selector: string; textOffset?: number }
  | { type: 'image'; assetId: string; rect?: [number, number, number, number] }
  | { type: 'time'; startMs: number; endMs: number }
  | { type: 'page'; pageNumber: number; rect?: [number, number, number, number] }
  | { type: 'none' }

export interface FragmentContext {
  excerpt: string
  sourceUrl: string
  sourceHost: string
  sourceTitle?: string
  locator: FragmentLocator
  capturedAt: number
}

// ── Fragment record (fragments.md §3) ───────────────────────────────────

export interface FragmentRecord<K extends FragmentKind = FragmentKind> {
  schemaVersion: 4
  id: string
  /** 1 on creation; bumped on every capture-field edit. */
  captureRevision: number
  kind: K

  content: string
  normalizedContent: string
  context: FragmentContext

  processing: {
    guess?: string
    verified: VerifiedResult
    use: string
  }

  detail: DetailOf<K>
  tags: string[]
  createdAt: number
  updatedAt: number
}

// ── Image assets & screenshot library (storage.md §3) ─────────────────

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface ImageAsset {
  id: string
  mimeType: ImageMimeType
  byteLength: number
  sha256: string
  width: number
  height: number
  createdAt: number
}

export interface ScreenshotRecord {
  id: string
  assetId: string
  sourceUrl: string
  sourceTitle?: string
  capturedAt: number
}
