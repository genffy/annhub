/**
 * User-facing kind names (kinds.md §4 headings; D-13: excerpt is always “摘录” / “Excerpt”).
 * The order follows extension.md §4.1: the common kinds first, excerpt last as the fallback when
 * nothing else fits.
 */
import type { FragmentKind } from '../learning-core/types'
import { uiText, type UiLanguage, type UiTextKey } from './ui-text'

/** Kinds a user can pick for a text capture (visual and media-clip come from their own capture paths). */
export const TEXT_KINDS = ['concept', 'claim', 'procedure', 'decision', 'question', 'inspiration', 'excerpt'] as const satisfies readonly FragmentKind[]

export const ALL_KINDS = [...TEXT_KINDS.slice(0, 6), 'visual', 'media-clip', 'excerpt'] as const satisfies readonly FragmentKind[]

export function kindLabel(kind: FragmentKind, lang?: UiLanguage): string {
  return uiText(`kind.${kind}` satisfies UiTextKey, {}, lang)
}
