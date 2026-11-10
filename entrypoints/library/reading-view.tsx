/**
 * The reading view — a clip read comfortably with the interactive highlight
 * surface and the side panel (extension.md §4.2). Route `#/read/<id>`;
 * `Esc` or 返回 returns to the previous list and position. The text sits
 * centred in its own column with the title and source above it; the right
 * rail holds the 高亮 / 属性 tabs. Highlights live in the clip (entry.md
 * §4); the side list sorts by position, and a click scrolls to the mark.
 * It fills the content area of the shell and nothing more: the nav stays
 * where it is and stays usable (extension.md §2.2).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Download, MessageSquareText } from 'lucide-react'
import MessageUtils from '../../utils/message'
import type { EntryRecord, HighlightColor, PropertyDefinition } from '../../core/types'
import { relativeTime } from './ui-text'
import { TypeChip } from './ui-text'
import { HighlightSurface } from './highlight-surface'
import type { LibraryDownload } from './download-client'
import { PropertyPanel, type PropertyPanelHandle } from './property-panel'
import { uiText } from './ui-text'

interface Props {
  entryId: string
  /** From `#/read/<id>?h=<highlight>`: the highlight the view opens scrolled to (the highlights view links here). */
  highlightId?: string | null
  defaultColor: HighlightColor
  registry: PropertyDefinition[]
  onClose(): void
  onEntryChanged(entry: EntryRecord): void
  registerFlush(flush: (() => Promise<boolean>) | null): void
  /** The library's one download run (download.md §3.1): one entry, straight away. */
  download: LibraryDownload
}

export function ReadingView({ entryId, highlightId = null, defaultColor, registry, onClose, onEntryChanged, registerFlush, download }: Props) {
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
    const response = await MessageUtils.sendMessage({ type: 'GET_ENTRY', id: entryId })
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

  /** The top bar: 返回 on the left, the source on the right, over the scrolling column (extension.md §4.2). */
  const bar = (
    <div className="rd-bar">
      <button type="button" ref={backButton} className="ghost sm quiet reading-back" onClick={closeWithSave}>
        <ArrowLeft size={14} aria-hidden /> {uiText('reading.back')}
      </button>
      <span className="rd-bar-space" aria-hidden />
      {entry && (
        <button
          type="button"
          className="ghost sm"
          data-testid="reading-download"
          title={uiText('library.downloadAsMarkdown')}
          onClick={() => void download.start({ entryIds: [entry.id], via: 'reading' })}
        >
          <Download size={14} aria-hidden /> {uiText('library.download')}
        </button>
      )}
      {entry && (
        <a className="ghost sm" href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
          {uiText('library.backToSource')} <ArrowUpRight size={14} aria-hidden />
        </a>
      )}
    </div>
  )

  if (!entry) {
    return (
      <div className="reading" data-testid="reading-view">
        <div className="reading-body">
          {bar}
          <div className="rd-col">
            <div className="rd-head-placeholder">{error || uiText('common.loading')}</div>
          </div>
        </div>
      </div>
    )
  }

  const highlights = [...(entry.highlights ?? [])].sort((a, b) => a.start - b.start)
  const tags = (entry.properties['tags'] as string[] | undefined) ?? []

  return (
    <div className="reading" data-testid="reading-view" data-entry-id={entry.id}>
      <div className="reading-body">
        {bar}

        <div className="rd-col">
          <div className="rd-head">
            <h1 className="reading-title">{String(entry.properties['title'] ?? '')}</h1>
            <div className="rd-meta">
              <TypeChip type={entry.type} small />
              <span className="rd-meta-host">{entry.sourceUrl.replace(/^https?:\/\//, '')}</span>
              <span className="rd-meta-dot" aria-hidden>
                ·
              </span>
              <span>{relativeTime(entry.createdAt)}</span>
              {tags.map(tag => (
                <span key={tag} className="tag">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

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
            <div className="drawer-context">
              <b>{uiText('library.context')}</b>
              <p>{entry.context}</p>
            </div>
          )}
        </div>
      </div>

      <aside className="reading-side" aria-label={uiText('reading.sideLabel')}>
        <div className="reading-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'highlights'}
            className={tab === 'highlights' ? 'reading-tab reading-tab-current' : 'reading-tab'}
            onClick={() => setTab('highlights')}
          >
            {uiText('library.highlights')} <b className="reading-tab-count">{highlights.length}</b>
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
          <section className="reading-side-section reading-hl-list" data-testid="hl-list">
            {highlights.length === 0 && <p className="rd-empty">{uiText('reading.empty')}</p>}
            {highlights.map(highlight => (
              /* the whole row locates the mark in the text; the name keeps the action for readers (extension.md §4.2) */
              <button
                key={highlight.id}
                type="button"
                className={`hl-row hl-row-${highlight.color}`}
                data-testid="hl-row"
                aria-label={uiText('reading.locateLabel', { text: highlight.quote })}
                onClick={() => locate(highlight.id, true)}
              >
                <p className="hl-quote">{highlight.quote}</p>
                {highlight.note && (
                  <p className="hl-note-text">
                    <MessageSquareText size={13} aria-hidden /> {highlight.note}
                  </p>
                )}
              </button>
            ))}
          </section>
        )}
      </aside>
    </div>
  )
}
