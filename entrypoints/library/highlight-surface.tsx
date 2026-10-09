/**
 * The interactive highlight surface — the reading article used by both the
 * reading view and the drawer's 原文 (extension.md §4.2: one component, so
 * highlights work in both places). Selection offers the five colors plus a
 * note button; `H` (wired by the parent page) uses the default color;
 * clicking a mark recolors, notes or deletes, with ~3s undo; overlapping
 * selections merge in the background per entry.md §4.6.
 */
import { useEffect, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import { newHighlightId } from '../../learning-core/assets'
import { HIGHLIGHT_COLORS, type EntryRecord, type Highlight, type HighlightColor } from '../../learning-core/types'
import { MarkdownView, quoteForRange, sourceRangeFromSelection } from './markdown-view'
import { uiText } from '../../utils/ui-text'

interface Props {
  entry: EntryRecord
  defaultColor: HighlightColor
  onEntryChanged(entry: EntryRecord): void
}

export function HighlightSurface({ entry, defaultColor, onEntryChanged }: Props) {
  const [toolbar, setToolbar] = useState<{ start: number; end: number; x: number; y: number } | null>(null)
  const [popover, setPopover] = useState<{ highlight: Highlight; x: number; y: number } | null>(null)
  const [notice, setNotice] = useState<{ text: string; undo?: Highlight } | null>(null)
  const [error, setError] = useState('')
  const surface = useRef<HTMLDivElement>(null)
  const undoTimer = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'h' || !surface.current) return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const range = sourceRangeFromSelection(surface.current, window.getSelection()!)
      if (range) void createHighlight(range.start, range.end, defaultColor, 'shortcut')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  async function createHighlight(start: number, end: number, color: HighlightColor, via: 'toolbar' | 'shortcut'): Promise<void> {
    const quote = quoteForRange(entry.content, { start, end })
    if (!quote) return
    const highlight: Highlight = { id: newHighlightId(), start, end, quote, color, createdAt: Date.now() }
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({ type: 'ADD_HIGHLIGHT', id: entry.id, highlight })
    if (!response.success || !response.data?.entry) {
      setError(response.error ?? uiText('toast.saveFailed'))
      return
    }
    setError('')
    onEntryChanged(response.data.entry)
    void MessageUtils.sendMessage({ type: 'RECORD_EVENT', name: 'highlight.created', props: { has_note: false, via } })
    window.getSelection()?.removeAllRanges()
    setToolbar(null)
  }

  /** Runs one highlight operation server-side (storage.md §5: one transaction per op). */
  async function runHighlightOp(message: Parameters<typeof MessageUtils.sendMessage>[0]): Promise<void> {
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>(message)
    if (!response.success || !response.data?.entry) {
      setError(response.error ?? uiText('toast.saveFailed'))
      return
    }
    setError('')
    onEntryChanged(response.data.entry)
  }

  function deleteHighlight(highlight: Highlight): void {
    void runHighlightOp({ type: 'REMOVE_HIGHLIGHT', id: entry.id, highlightId: highlight.id })
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current)
    setNotice({ text: uiText('reading.deleted'), undo: highlight })
    undoTimer.current = window.setTimeout(() => setNotice(null), 3000)
  }

  function undoDelete(): void {
    const highlight = notice?.undo
    if (!highlight) return
    setNotice(null)
    void runHighlightOp({ type: 'RESTORE_HIGHLIGHT', id: entry.id, highlight })
  }

  const highlights = [...(entry.highlights ?? [])].sort((a, b) => a.start - b.start)

  return (
    <div className="hl-surface">
      <div
        ref={surface}
        onMouseUp={event => {
          const range = sourceRangeFromSelection(surface.current!, window.getSelection()!)
          if (range) setToolbar({ start: range.start, end: range.end, x: event.clientX, y: event.clientY })
          else setToolbar(null)
        }}
      >
        <MarkdownView
          markdown={entry.content}
          highlights={highlights}
          surfaceClass="md-view"
          onHighlightClick={(highlight, event) => {
            setPopover({ highlight, x: event.clientX, y: event.clientY })
            window.getSelection()?.removeAllRanges()
            setToolbar(null)
          }}
        />
      </div>

      {notice && (
        <div className="hl-notice" role="status" data-testid="hl-notice">
          {notice.text}{' '}
          {notice.undo && (
            <button type="button" className="link" onClick={() => undoDelete()}>
              {uiText('toast.undo')}
            </button>
          )}
        </div>
      )}
      {error && <p className="warn">{error}</p>}

      {toolbar && (
        <div className="hl-toolbar" style={{ left: toolbar.x, top: Math.max(8, toolbar.y - 46) }} data-testid="hl-toolbar" role="toolbar">
          {HIGHLIGHT_COLORS.map(color => (
            <button
              key={color}
              type="button"
              className={`hl-dot hl-dot-${color}`}
              aria-label={color}
              onClick={() => void createHighlight(toolbar.start, toolbar.end, color, 'toolbar')}
            />
          ))}
          <button type="button" className="hl-note-button" onClick={() => void createHighlight(toolbar.start, toolbar.end, defaultColor, 'toolbar')}>
            {uiText('reading.note')}
          </button>
        </div>
      )}

      {popover && (
        <HighlightPopover
          highlight={popover.highlight}
          x={popover.x}
          y={popover.y}
          onClose={() => setPopover(null)}
          onColor={color => {
            void runHighlightOp({ type: 'UPDATE_HIGHLIGHT', id: entry.id, highlightId: popover.highlight.id, patch: { color } })
            setPopover(null)
          }}
          onNote={note => {
            void runHighlightOp({ type: 'UPDATE_HIGHLIGHT', id: entry.id, highlightId: popover.highlight.id, patch: { note: note || null } })
            setPopover(null)
          }}
          onDelete={() => {
            deleteHighlight(popover.highlight)
            setPopover(null)
          }}
        />
      )}
    </div>
  )
}

function HighlightPopover({
  highlight,
  x,
  y,
  onClose,
  onColor,
  onNote,
  onDelete,
}: {
  highlight: Highlight
  x: number
  y: number
  onClose(): void
  onColor(color: HighlightColor): void
  onNote(note: string): void
  onDelete(): void
}) {
  const [note, setNote] = useState(highlight.note ?? '')
  return (
    <div className="hl-popover" style={{ left: x, top: y + 14 }} data-testid="hl-popover" role="dialog" aria-label={uiText('reading.edit')}>
      <div className="hl-popover-colors">
        {HIGHLIGHT_COLORS.map(color => (
          <button
            key={color}
            type="button"
            className={`hl-dot hl-dot-${color}${highlight.color === color ? ' hl-dot-active' : ''}`}
            aria-label={color}
            onClick={() => onColor(color)}
          />
        ))}
      </div>
      <textarea
        value={note}
        placeholder={uiText('reading.note')}
        onChange={event => setNote(event.target.value)}
        onBlur={() => onNote(note)}
        rows={2}
        aria-label={uiText('reading.note')}
        data-testid="hl-note-input"
      />
      <div className="hl-popover-actions">
        <button type="button" className="danger" data-testid="hl-delete" onClick={onDelete}>
          {uiText('library.delete')}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          {uiText('common.close')}
        </button>
      </div>
    </div>
  )
}
