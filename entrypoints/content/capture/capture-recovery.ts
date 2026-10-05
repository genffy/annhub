/**
 * What the capture window can hand back to the user when saving fails or the
 * window is abandoned (extension.md §4.1 / §9): the typed understanding,
 * verification and application text must never be lost. Pure helpers, so the
 * wording is testable in both languages.
 */
import { uiText, type UiLanguage } from '../../../utils/ui-text'

export interface RecoverableInput {
  kindLabel: string
  content: string
  excerpt: string
  sourceUrl: string
  sourceTitle: string
  guess: string
  summary: string
  notes: string
  use: string
  tags: string
  /** Labelled per-kind detail values the user typed (already filtered to non-empty). */
  details: Array<[label: string, value: string]>
}

const line = (label: string, value: string, lang?: UiLanguage): string | null => (value.trim() ? uiText('capture.line', { label, value: value.trim() }, lang) : null)

/**
 * The note attached when the window is converted to a Highlight or a Clip: the
 * user's own processing text, so “save as” keeps what they wrote. The selected
 * text and its context are already stored by the Highlight / Clip itself.
 */
export function fallbackNote(input: RecoverableInput, lang?: UiLanguage): string {
  return [
    line(uiText('capture.note.guess', {}, lang), input.guess, lang),
    line(uiText('capture.note.summary', {}, lang), input.summary, lang),
    line(uiText('capture.note.notes', {}, lang), input.notes, lang),
    line(uiText('capture.note.use', {}, lang), input.use, lang),
    ...input.details.map(([label, value]) => line(label, value, lang)),
    line(uiText('capture.note.tags', {}, lang), input.tags, lang),
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
}

/** Everything the user typed, as plain text for “Copy my input”. */
export function copyableInput(input: RecoverableInput, lang?: UiLanguage): string {
  const header = [
    line(uiText('capture.copy.kind', {}, lang), input.kindLabel, lang),
    line(uiText('capture.copy.content', {}, lang), input.content, lang),
    line(uiText('capture.copy.context', {}, lang), input.excerpt, lang),
    line(
      uiText('capture.copy.source', {}, lang),
      input.sourceTitle ? uiText('capture.copy.sourceWithTitle', { title: input.sourceTitle, url: input.sourceUrl }, lang) : input.sourceUrl,
      lang,
    ),
  ]
  return [...header, fallbackNote(input, lang)].filter((l): l is string => !!l && l.trim() !== '').join('\n')
}

/** Whether there is anything the user typed that closing would lose. */
export function hasTypedInput(input: Pick<RecoverableInput, 'guess' | 'summary' | 'notes' | 'use' | 'tags' | 'details'>): boolean {
  return !!(input.guess.trim() || input.summary.trim() || input.notes.trim() || input.use.trim() || input.tags.trim() || input.details.length)
}
