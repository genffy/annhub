/**
 * The reading view — a clip read comfortably with the interactive highlight
 * surface and the side panel (extension.md §4.2). Route `#/read/<id>`;
 * `Esc` or 返回 returns to the previous list and position. Highlights
 * live in the clip (entry.md §4); the side list sorts by position, and a
 * click scrolls to the mark.
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { EntryRecord, HighlightColor } from '../../learning-core/types'
import { HighlightSurface } from './highlight-surface'
import { uiText } from '../../utils/ui-text'

interface Props {
  entryId: string
  defaultColor: HighlightColor
  onClose(): void
  onEntryChanged(entry: EntryRecord): void
}

export function ReadingView({ entryId, defaultColor, onClose, onEntryChanged }: Props) {
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({ type: 'GET_ENTRY', id: entryId })
    if (!response.success || !response.data?.entry) {
      setError(response.error ?? 'not found')
      return
    }
    setEntry(response.data.entry)
  }, [entryId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!entry) {
    return (
      <div className="reading" data-testid="reading-view">
        <div className="reading-body">{error || uiText('common.loading')}</div>
      </div>
    )
  }

  const highlights = [...(entry.highlights ?? [])].sort((a, b) => a.start - b.start)

  return (
    <div className="reading" data-testid="reading-view" data-entry-id={entry.id}>
      <header className="reading-header">
        <button type="button" className="ghost" onClick={onClose} aria-label={uiText('common.close')}>
          ←
        </button>
        <span className="reading-title">{String(entry.properties['title'] ?? '')}</span>
        <a className="link" href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
          {uiText('library.backToSource')}
        </a>
      </header>

      <div className="reading-layout">
        <div className="reading-body">
          {highlights.length > 0 && <p className="reading-lock">{uiText('reading.locked')}</p>}
          <HighlightSurface entry={entry} defaultColor={defaultColor} onEntryChanged={onEntryChanged} />
          {entry.context && (
            <section className="drawer-context">
              <h3>context</h3>
              <p>{entry.context}</p>
            </section>
          )}
        </div>

        <aside className="reading-side">
          <section className="reading-side-section" data-testid="hl-list">
            <h3>
              {uiText('library.highlights')} · {highlights.length}
            </h3>
            {highlights.length === 0 && <p className="hint">{uiText('reading.empty')}</p>}
            {highlights.map(highlight => (
              <div key={highlight.id} className={`hl-row hl-row-${highlight.color}`} data-testid="hl-row">
                <p className="hl-quote">{highlight.quote}</p>
                {highlight.note && <p className="hl-note-text">{highlight.note}</p>}
                <button
                  type="button"
                  className="link"
                  onClick={() => document.querySelector(`[data-hl-id="${highlight.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                >
                  {uiText('reading.locate')}
                </button>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  )
}
