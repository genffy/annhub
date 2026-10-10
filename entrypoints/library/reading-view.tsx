/**
 * The reading view — a clip read comfortably with the interactive highlight
 * surface and the side panel (extension.md §4.2). Route `#/read/<id>`;
 * `Esc` or 返回 returns to the previous list and position. Highlights
 * live in the clip (entry.md §4); the side list sorts by position, and a
 * click scrolls to the mark. It fills the content area of the shell and
 * nothing more: the nav stays where it is and stays usable (extension.md §2.2).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import MessageUtils from '../../utils/message'
import type { EntryRecord, HighlightColor, PropertyDefinition } from '../../learning-core/types'
import { HighlightSurface } from './highlight-surface'
import { PropertyPanel, type PropertyPanelHandle } from './property-panel'
import { uiText } from '../../utils/ui-text'

interface Props {
  entryId: string
  /** From `#/read/<id>?h=<highlight>`: the highlight the view opens scrolled to (the highlights view links here). */
  highlightId?: string | null
  defaultColor: HighlightColor
  registry: PropertyDefinition[]
  onClose(): void
  onEntryChanged(entry: EntryRecord): void
  registerFlush(flush: (() => Promise<boolean>) | null): void
}

export function ReadingView({ entryId, highlightId = null, defaultColor, registry, onClose, onEntryChanged, registerFlush }: Props) {
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'highlights' | 'properties'>('highlights')
  const propertyPanel = useRef<PropertyPanelHandle>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const openedAt = useRef<string | null>(null)

  const flush = useCallback(async (): Promise<boolean> => (await propertyPanel.current?.flush()) ?? true, [])
  const closeWithSave = useCallback(() => {
    void flush().then(ok => {
      if (ok) onClose()
    })
  }, [flush, onClose])

  useEffect(() => {
    registerFlush(flush)
    return () => registerFlush(null)
  }, [flush, registerFlush])

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({ type: 'GET_ENTRY', id: entryId })
    if (!response.success || !response.data?.entry) {
      setError(uiText('library.error.notFound'))
      return
    }
    setEntry(response.data.entry)
  }, [entryId])

  useEffect(() => {
    void load()
  }, [load])

  // the view replaces what the keyboard was on (the drawer's button, a highlights row): focus starts at its own first control
  const loaded = entry !== null || error !== ''
  useEffect(() => {
    if (loaded) backButton.current?.focus({ preventScroll: true })
  }, [loaded])

  /** Scrolls a highlight into the middle of the window and lets it flash once (a mark can span several runs: the first one leads). */
  const locate = useCallback((id: string, smooth: boolean): void => {
    const mark = document.querySelector<HTMLElement>(`[data-hl-id="${CSS.escape(id)}"]`)
    if (!mark) return
    mark.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'instant' })
    mark.classList.add('md-hl-flash')
    window.setTimeout(() => mark.classList.remove('md-hl-flash'), 1_400)
  }, [])

  // arriving from the highlights view: the reading view opens at the highlight that was clicked
  useEffect(() => {
    if (!entry || !highlightId || openedAt.current === highlightId) return
    openedAt.current = highlightId
    locate(highlightId, false)
  }, [entry, highlightId, locate])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // an Escape that ends an input-method composition is not a request to leave
      if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) closeWithSave()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeWithSave])

  const header = (
    <header className="reading-header">
      <button type="button" ref={backButton} className="ghost reading-back" onClick={closeWithSave}>
        <ArrowLeft size={15} aria-hidden /> {uiText('reading.back')}
      </button>
      <h1 className="reading-title">{entry ? String(entry.properties['title'] ?? '') : ''}</h1>
      {entry && (
        <a className="link" href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
          {uiText('library.backToSource')}
        </a>
      )}
    </header>
  )

  if (!entry) {
    return (
      <div className="reading" data-testid="reading-view">
        {header}
        <div className="reading-body">{error || uiText('common.loading')}</div>
      </div>
    )
  }

  const highlights = [...(entry.highlights ?? [])].sort((a, b) => a.start - b.start)

  return (
    <div className="reading" data-testid="reading-view" data-entry-id={entry.id}>
      {header}

      <div className="reading-layout">
        <div className="reading-body">
          {highlights.length > 0 && <p className="reading-lock">{uiText('reading.locked')}</p>}
          <HighlightSurface
            entry={entry}
            defaultColor={defaultColor}
            onEntryChanged={next => {
              setEntry(next)
              onEntryChanged(next)
            }}
          />
          {entry.context && (
            <section className="drawer-context">
              <h3>{uiText('library.context')}</h3>
              <p>{entry.context}</p>
            </section>
          )}
        </div>

        <aside className="reading-side">
          <div className="reading-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'highlights'}
              className={tab === 'highlights' ? 'reading-tab reading-tab-current' : 'reading-tab'}
              onClick={() => setTab('highlights')}
            >
              {uiText('library.highlights')} · {highlights.length}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'properties'}
              className={tab === 'properties' ? 'reading-tab reading-tab-current' : 'reading-tab'}
              onClick={() => setTab('properties')}
            >
              {uiText('library.properties')}
            </button>
          </div>
          {tab === 'properties' ? (
            <section className="reading-side-section" data-testid="reading-properties">
              <PropertyPanel
                ref={propertyPanel}
                entry={entry}
                registry={registry}
                onEntryChanged={next => {
                  setEntry(next)
                  onEntryChanged(next)
                }}
              />
            </section>
          ) : (
            <section className="reading-side-section" data-testid="hl-list">
              <h3>
                {uiText('library.highlights')} · {highlights.length}
              </h3>
              {highlights.length === 0 && <p className="hint">{uiText('reading.empty')}</p>}
              {highlights.map(highlight => (
                <div key={highlight.id} className={`hl-row hl-row-${highlight.color}`} data-testid="hl-row">
                  <p className="hl-quote">{highlight.quote}</p>
                  {highlight.note && <p className="hl-note-text">{highlight.note}</p>}
                  <button type="button" className="link" onClick={() => locate(highlight.id, true)}>
                    {uiText('reading.locate')}
                  </button>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
