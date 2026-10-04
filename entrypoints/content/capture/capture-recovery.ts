/**
 * What the capture window can hand back to the user when saving fails or the
 * window is abandoned (extension.md §4.1 / §9): the typed 理解、核验、应用
 * text must never be lost. Pure helpers, so the wording is testable.
 */
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

const line = (label: string, value: string): string | null => (value.trim() ? `${label}：${value.trim()}` : null)

/**
 * The note attached when the window is converted to a Highlight or a Clip: the
 * user's own processing text, so “改存” keeps what they wrote. The selected
 * text and its context are already stored by the Highlight / Clip itself.
 */
export function fallbackNote(input: RecoverableInput): string {
  return [
    line('理解', input.guess),
    line('核验摘要', input.summary),
    line('核验备注', input.notes),
    line('应用', input.use),
    ...input.details.map(([label, value]) => line(label, value)),
    line('标签', input.tags),
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
}

/** Everything the user typed, as plain text for “复制我的输入”. */
export function copyableInput(input: RecoverableInput): string {
  const header = [
    `类型：${input.kindLabel}`,
    line('内容', input.content),
    line('上下文', input.excerpt),
    line('来源', input.sourceTitle ? `${input.sourceTitle}（${input.sourceUrl}）` : input.sourceUrl),
  ]
  return [...header, fallbackNote(input)].filter((l): l is string => !!l && l.trim() !== '').join('\n')
}

/** Whether there is anything the user typed that closing would lose. */
export function hasTypedInput(input: Pick<RecoverableInput, 'guess' | 'summary' | 'notes' | 'use' | 'tags' | 'details'>): boolean {
  return !!(input.guess.trim() || input.summary.trim() || input.notes.trim() || input.use.trim() || input.tags.trim() || input.details.length)
}
