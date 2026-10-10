/**
 * The interactive highlight surface — the reading article used by both the
 * reading view and the drawer's 原文 (extension.md §4.2: one component, so
 * highlights work in both places). Selection offers the five colors plus a
 * note button; `H` (wired by the parent page) uses the default color;
 * clicking a mark recolors, notes or deletes, with ~3s undo; overlapping
 * selections merge in the background per entry.md §4.6.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import { newHighlightId } from '../../learning-core/assets'
import { HIGHLIGHT_COLORS, type EntryRecord, type Highlight, type HighlightColor } from '../../learning-core/types'
import { MarkdownView, quoteForRange, sourceRangeFromSelection } from './markdown-view'
import { entryErrorText, uiText } from '../../utils/ui-text'

interface Props {
  entry: EntryRecord
  defaultColor: HighlightColor
  onEntryChanged(entry: EntryRecord): void
}

interface ToolbarState {
  start: number
  end: number
  x: number
  y: number
}

interface PopoverState {
  highlight: Highlight
  x: number
  y: number
  /** What had focus when the popover opened: focus goes back there when it closes. */
  trigger: HTMLElement | null
}

export function HighlightSurface({ entry, defaultColor, onEntryChanged }: Props) {
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [notice, setNotice] = useState<{ text: string; undo?: Highlight } | null>(null)
  const [error, setError] = useState('')
  const surface = useRef<HTMLDivElement>(null)
  const undoTimer = useRef<number | null>(null)
  const toolbarRef = useRef(toolbar)
  toolbarRef.current = toolbar
  const dragging = useRef(false)

  const closePopover = useCallback(() => {
    setPopover(current => {
      if (current?.trigger?.isConnected) current.trigger.focus({ preventScroll: true })
      return null
    })
  }, [])

  // A selection made with the keyboard (Shift + arrows, Ctrl/Cmd+A) offers the same toolbar a drag does
  // (extension.md §4.2). A drag in progress is left to its own mouseup.
  useEffect(() => {
    let timer: number | null = null
    const onDown = (event: MouseEvent): void => {
      dragging.current = Boolean(surface.current?.contains(event.target as Node))
    }
    const onUp = (): void => {
      dragging.current = false
    }
    const onChange = (): void => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        if (dragging.current || !surface.current) return
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
        const range = sourceRangeFromSelection(surface.current, selection, entry.content)
        if (!range) return
        const shown = toolbarRef.current
        if (shown && shown.start === range.start && shown.end === range.end) return // the mouse path already placed it
        const box = selection.getRangeAt(0).getBoundingClientRect()
        setToolbar({ start: range.start, end: range.end, x: box.right, y: box.top })
      }, 180)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('mouseup', onUp, true)
    document.addEventListener('selectionchange', onChange)
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('mouseup', onUp, true)
      document.removeEventListener('selectionchange', onChange)
    }
  }, [entry.content])

  // Escape dismisses the toolbar first; the next one leaves the view (extension.md §7.1: innermost first)
  useEffect(() => {
    if (!toolbar) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
      event.preventDefault()
      event.stopPropagation()
      setToolbar(null)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [toolbar])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'h' || event.ctrlKey || event.metaKey || event.altKey || !surface.current) return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const range = sourceRangeFromSelection(surface.current, window.getSelection()!, entry.content)
      if (range) void createHighlight(range.start, range.end, defaultColor, 'shortcut')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  async function createHighlight(start: number, end: number, color: HighlightColor, via: 'toolbar' | 'shortcut', hasNote = false): Promise<Highlight | null> {
    const quote = quoteForRange(entry.content, { start, end })
    if (!quote) return null
    const highlight: Highlight = { id: newHighlightId(), start, end, quote, color, createdAt: Date.now() }
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({ type: 'ADD_HIGHLIGHT', id: entry.id, highlight })
    if (!response.success || !response.data?.entry) {
      setError(entryErrorText(response.error))
      return null
    }
    setError('')
    onEntryChanged(response.data.entry)
    void MessageUtils.sendMessage({ type: 'RECORD_EVENT', name: 'highlight.created', props: { has_note: hasNote, via } })
    window.getSelection()?.removeAllRanges()
    setToolbar(null)
    return (response.data.entry.highlights ?? []).find(item => item.id === highlight.id) ?? highlight
  }

  /** Runs one highlight operation server-side (storage.md §5: one transaction per op). */
  async function runHighlightOp(message: Parameters<typeof MessageUtils.sendMessage>[0]): Promise<boolean> {
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>(message)
    if (!response.success || !response.data?.entry) {
      setError(response.error === 'HIGHLIGHT_INVALID' ? uiText('reading.error.noteTooLong') : uiText('toast.saveFailed'))
      return false
    }
    setError('')
    onEntryChanged(response.data.entry)
    return true
  }

  function deleteHighlight(highlight: Highlight): void {
    // "deleted · undo" is said only once the write has gone through
    void runHighlightOp({ type: 'REMOVE_HIGHLIGHT', id: entry.id, highlightId: highlight.id }).then(ok => {
      if (!ok) return
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current)
      setNotice({ text: uiText('reading.deleted'), undo: highlight })
      undoTimer.current = window.setTimeout(() => setNotice(null), 3000)
    })
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
          const range = sourceRangeFromSelection(surface.current!, window.getSelection()!, entry.content)
          if (range) setToolbar({ start: range.start, end: range.end, x: event.clientX, y: event.clientY })
          else setToolbar(null)
        }}
      >
        <MarkdownView
          markdown={entry.content}
          highlights={highlights}
          surfaceClass="md-view"
          onHighlightClick={(highlight, event) => {
            // a keyboard activation has no pointer position: the popover opens under the mark
            const mark = event.currentTarget as HTMLElement
            const box = mark.getBoundingClientRect()
            setPopover({
              highlight,
              x: Number.isFinite(event.clientX) ? event.clientX : box.left,
              y: Number.isFinite(event.clientY) ? event.clientY : box.bottom,
              trigger: mark,
            })
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
          <button
            type="button"
            className="hl-note-button"
            onClick={() => {
              const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
              void createHighlight(toolbar.start, toolbar.end, defaultColor, 'toolbar', true).then(created => {
                if (created) setPopover({ highlight: created, x: toolbar.x, y: toolbar.y, trigger })
              })
            }}
          >
            {uiText('reading.note')}
          </button>
        </div>
      )}

      {popover && (
        <HighlightPopover
          highlight={popover.highlight}
          x={popover.x}
          y={popover.y}
          onClose={closePopover}
          onColor={color => {
            void runHighlightOp({ type: 'UPDATE_HIGHLIGHT', id: entry.id, highlightId: popover.highlight.id, patch: { color } })
            closePopover()
          }}
          onNote={note => {
            // saves in place; the popover stays open for further edits
            return runHighlightOp({ type: 'UPDATE_HIGHLIGHT', id: entry.id, highlightId: popover.highlight.id, patch: { note: note || null } })
          }}
          onDelete={() => {
            deleteHighlight(popover.highlight)
            closePopover()
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
  onNote(note: string): Promise<boolean>
  onDelete(): void
}) {
  const [note, setNote] = useState(highlight.note ?? '')
  const root = useRef<HTMLDivElement>(null)
  // Focus moves in on open: Escape then closes this popover (saving the note) before the reading view
  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div
      ref={root}
      tabIndex={-1}
      className="hl-popover"
      style={{ left: x, top: y + 14 }}
      data-testid="hl-popover"
      role="dialog"
      aria-label={uiText('reading.edit')}
      onKeyDownCapture={event => {
        if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.stopPropagation()
        void onNote(note).then(ok => {
          if (ok) onClose()
        })
      }}
    >
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
        // blur SAVES the note but never closes the popover — a click on
        // delete or a color must still land (RV-LIB-08)
        onBlur={() => void onNote(note)}
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
