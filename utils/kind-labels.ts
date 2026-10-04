/**
 * User-facing kind names (kinds.md §4 headings; D-13: excerpt is always “摘录”).
 * The order follows extension.md §4.1: the common kinds first, 摘录 last as the
 * fallback when nothing else fits.
 */
import type { FragmentKind } from '../learning-core/types'

export const KIND_LABELS: Record<FragmentKind, string> = {
  'concept': '概念',
  'claim': '论点',
  'procedure': '方法',
  'decision': '决策',
  'question': '问题',
  'inspiration': '灵感',
  'visual': '视觉',
  'media-clip': '媒体片段',
  'excerpt': '摘录',
}

/** Kinds a user can pick for a text capture (visual and media-clip come from their own capture paths). */
export const TEXT_KINDS = ['concept', 'claim', 'procedure', 'decision', 'question', 'inspiration', 'excerpt'] as const satisfies readonly FragmentKind[]

export const ALL_KINDS = Object.keys(KIND_LABELS) as FragmentKind[]
