/**
 * The detail drawer (extension.md §4.1): the entry's meta, the clip's editable original and context,
 * the screenshot's asset, and the deletion confirm card. Moved verbatim from App.tsx when the file
 * went over its byte budget.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EntryRecord, PropertyDefinition, HighlightColor } from '../../learning-core/types'
import { PropertyPanel, type PropertyPanelHandle } from './property-panel'
import { HighlightSurface } from './highlight-surface'
import MessageUtils from '../../utils/message'
import { relativeTime } from '../../utils/relative-time'
import { CONTENT_MAX_CHARS, CONTEXT_MAX_CHARS } from '../../learning-core/validate'
import { ArrowUpRight, BookOpen, Download, Image, Lock, MessageSquareText, Tags, TextQuote, Trash2, X } from 'lucide-react'
import { uiText } from '../../utils/ui-text'

function boldenCount(text: string, count: number) {
  const parts = text.split(String(count))
  return (
    <>
      {parts[0]}
      <b>{count}</b>
      {parts.slice(1).join(String(count))}
    </>
  )
}

/** Why the original text or the context was not written: the lock and the two limits have their own words (entry.md §4.7, §5). */
function editFailureText(field: 'content' | 'context', code?: string): string {
  if (code === 'ENTRY_CONTENT_LOCKED') return uiText('reading.locked')
  if (code === 'ENTRY_CONTENT_INVALID') {
    return field === 'content'
      ? uiText('library.error.contentInvalid', { limit: CONTENT_MAX_CHARS.toLocaleString() })
      : uiText('library.error.contextInvalid', { limit: CONTEXT_MAX_CHARS.toLocaleString() })
  }
  return entryErrorText(code)
}

export function DetailDrawer({
  entryId,
  defaultColor,
  registry,
  onClose,
  onDeleted,
  onEntryChanged,
  registerFlush,
  onOpenReading,
}: {
  entryId: string
  defaultColor: HighlightColor
  registry: PropertyDefinition[]
  onClose: () => void
  onDeleted(): void
  onEntryChanged(): void
  registerFlush(flush: (() => Promise<boolean>) | null): void
  onOpenReading(id: string): void
}) {
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [assetMissing, setAssetMissing] = useState(false)
  const [imageZoom, setImageZoom] = useState(false)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  // the clip's own two texts: one of them can be open for editing, and its draft stays in the textarea until it is written (extension.md §4.1)
  const [editing, setEditing] = useState<'content' | 'context' | null>(null)
  const [draft, setDraft] = useState('')
  const [editError, setEditError] = useState('')
  const editWrite = useRef<Promise<boolean> | null>(null)
  /** The text whose "编辑" button takes the keyboard back when its editor closes through Save or Cancel. */
  const restoreFocus = useRef<'content' | 'context' | null>(null)
  const propertyPanel = useRef<PropertyPanelHandle>(null)
  const drawerElement = useRef<HTMLElement>(null)
  /** The header's "删除": the keyboard goes back to it when the confirm goes away without deleting. */
  const deleteButton = useRef<HTMLButtonElement>(null)
  const confirmCancelButton = useRef<HTMLButtonElement>(null)
  const confirmDeleteButton = useRef<HTMLButtonElement>(null)
  const loadedEntryId = entry?.id

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({ type: 'GET_ENTRY', id: entryId })
    if (!response.success || !response.data?.entry) {
      setError(uiText('library.error.notFound'))
      return
    }
    const loaded = response.data.entry
    setEntry(loaded)
    setNote(loaded.note ?? '')
    setAssetMissing(false)
    setAssetUrl(null)
    if (loaded.type === 'screenshot' && loaded.assetId) {
      const asset = await MessageUtils.sendMessage<{ dataUrl: string }>({ type: 'GET_ASSET_DATA_URL', assetId: loaded.assetId })
      if (asset.success && asset.data?.dataUrl) setAssetUrl(asset.data.dataUrl)
      else setAssetMissing(true)
    }
  }, [entryId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!loadedEntryId) return
    drawerElement.current?.querySelector<HTMLElement>('a[href], button:not([disabled]), input, textarea, select')?.focus()
  }, [loadedEntryId])

  const persist = useCallback(async (): Promise<boolean> => {
    // nothing loaded (still loading, or the entry is gone) means nothing to save, and the drawer must still close
    if (!entry) return true
    if (note === (entry.note ?? '')) return true
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({
      type: 'UPDATE_ENTRY',
      id: entry.id,
      // null clears the note; an undefined key would not survive the JSON transport
      patch: { note: note.trim() ? note.trim() : null },
    })
    if (!response.success) {
      setError(entryErrorText(response.error))
      return false
    }
    setEntry(response.data!.entry)
    onEntryChanged()
    return true
  }, [entry, note, onEntryChanged])

  /** Writes the open text if it changed and leaves editing; a failure keeps the draft and says why next to it. */
  const commitEdit = useCallback(async (): Promise<boolean> => {
    if (editWrite.current) return editWrite.current
    if (!entry || !editing) return true
    const field = editing
    if (draft === (field === 'content' ? entry.content : (entry.context ?? ''))) {
      setEditing(null)
      setEditError('')
      return true
    }
    const task = (async (): Promise<boolean> => {
      const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({
        type: 'UPDATE_ENTRY',
        id: entry.id,
        // an emptied context is removed; an emptied original is a mistake the worker refuses
        patch: field === 'content' ? { content: draft } : { context: draft.trim() ? draft : null },
      })
      if (!response.success) {
        setEditError(editFailureText(field, response.error))
        return false
      }
      setEntry(response.data!.entry)
      setEditing(null)
      setEditError('')
      onEntryChanged()
      return true
    })()
    editWrite.current = task
    const ok = await task
    editWrite.current = null
    return ok
  }, [entry, editing, draft, onEntryChanged])

  /** Opens a text for editing; the other one, if it was open, is written first. */
  const startEdit = (field: 'content' | 'context'): void => {
    if (!entry) return
    void commitEdit().then(ok => {
      if (!ok) return
      setDraft(field === 'content' ? entry.content : (entry.context ?? ''))
      setEditError('')
      setEditing(field)
    })
  }

  /** Save: the same write a blur makes, and the keyboard goes back to the text's "编辑" button when it worked. */
  const saveEdit = (): void => {
    restoreFocus.current = editing
    void commitEdit().then(ok => {
      if (!ok) restoreFocus.current = null
    })
  }

  /** Cancel: the way out of a draft the worker refuses; what was typed is dropped, the saved text stays. */
  const cancelEdit = (): void => {
    restoreFocus.current = editing
    setEditing(null)
    setEditError('')
  }

  useEffect(() => {
    if (editing !== null || !restoreFocus.current) return
    const target = restoreFocus.current === 'content' ? 'edit-original' : 'edit-context'
    restoreFocus.current = null
    drawerElement.current?.querySelector<HTMLElement>(`[data-testid="${target}"]`)?.focus()
  }, [editing])

  /** The open text: a textarea that writes when it loses focus, the error beside it, and Save and Cancel under it. */
  const editor = (rows: number, label: string) => (
    <>
      <textarea
        className="drawer-edit"
        autoFocus
        rows={rows}
        value={draft}
        aria-label={label}
        onChange={event => setDraft(event.target.value)}
        onBlur={event => {
          // going to Save or Cancel is not leaving the editor: the button decides
          if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('.drawer-edit-actions')) return
          void commitEdit()
        }}
      />
      {editError && (
        <p className="warn" role="alert">
          {editError}
        </p>
      )}
      <div className="drawer-edit-actions">
        {/* mousedown would take the focus off the textarea and write the draft before Cancel could drop it */}
        <button type="button" className="ghost" onMouseDown={event => event.preventDefault()} onClick={saveEdit}>
          {uiText('common.save')}
        </button>
        <button type="button" className="ghost" onMouseDown={event => event.preventDefault()} onClick={cancelEdit}>
          {uiText('common.cancel')}
        </button>
      </div>
    </>
  )

  const flush = useCallback(async (): Promise<boolean> => {
    if ((await propertyPanel.current?.flush()) === false) return false
    if (!(await commitEdit())) return false
    return persist()
  }, [persist, commitEdit])

  useEffect(() => {
    registerFlush(flush)
    return () => registerFlush(null)
  }, [flush, registerFlush])

  /** Every close path commits the property and note drafts first. */
  const closeWithSave = useCallback(() => {
    void flush().then(ok => {
      if (ok) onClose()
    })
  }, [flush, onClose])

  // The key handler is subscribed once and calls the latest save-and-close. A listener rebuilt in a passive effect
  // leaves a gap after an async render (the entry arriving) in which Escape still reaches the previous render's closure.
  const closeRef = useRef(closeWithSave)
  useLayoutEffect(() => {
    closeRef.current = closeWithSave
  }, [closeWithSave])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) closeRef.current()
      if (event.key !== 'Tab' || !drawerElement.current) return
      const focusable = [
        ...drawerElement.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ]
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && (document.activeElement === first || !drawerElement.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !drawerElement.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  /** The confirm leaves without deleting; the keyboard goes back to the "删除" button that opened it. */
  const closeConfirm = useCallback(() => {
    setConfirmDelete(false)
    deleteButton.current?.focus()
  }, [])

  if (!entry) {
    return (
      <>
        <div className="drawer-backdrop" onClick={closeWithSave} />
        <aside ref={drawerElement} className="drawer" role="dialog" aria-modal="true" aria-label={uiText('library.properties')}>
          <div className="drawer-body">{error || uiText('common.loading')}</div>
        </aside>
      </>
    )
  }

  // a clip with highlights keeps its original text as it is: their ranges point into it (entry.md §4.7)
  const contentLocked = entry.type === 'clip' && (entry.highlights?.length ?? 0) > 0
  const highlightCount = entry.highlights?.length ?? 0

  return (
    <>
      <div className="drawer-backdrop" onClick={closeWithSave} />
      <aside ref={drawerElement} className="drawer" role="dialog" aria-modal="true" aria-labelledby={`drawer-title-${entry.id}`} data-entry-id={entry.id}>
        <header className="drawer-header">
          <TypeChip type={entry.type} />
          <span className="drawer-header-space" aria-hidden />
          {/* the header's actions in one row — 阅读 / 回到来源 / 删除 / 关闭 (extension.md §4.1) */}
          <span className="drawer-header-actions">
            {entry.type === 'clip' && (
              <button type="button" className="ghost sm" data-testid="drawer-read" onClick={() => void flush().then(ok => ok && onOpenReading(entry.id))}>
                <BookOpen size={14} aria-hidden /> {uiText('library.read')}
              </button>
            )}
            {/* a link by meaning, a button by look (extension.md §4.1) */}
            <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="ghost sm">
              {uiText('library.backToSource')} <ArrowUpRight size={14} aria-hidden />
            </a>
            <button
              type="button"
              className="ghost-icon"
              ref={deleteButton}
              aria-label={uiText('library.delete')}
              title={uiText('library.delete')}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} aria-hidden />
            </button>
            <button type="button" className="ghost-icon" onClick={closeWithSave} aria-label={uiText('common.close')} title={uiText('common.close')}>
              <X size={15} aria-hidden />
            </button>
          </span>
        </header>
        <div className="drawer-title-block">
          <div className="drawer-title" id={`drawer-title-${entry.id}`}>
            {String(entry.properties['title'] ?? '')}
          </div>
          <p className="drawer-sub">
            {entry.sourceUrl.replace(/^https?:\/\//, '')} · {relativeTime(entry.createdAt)}
          </p>
        </div>
        <div className="drawer-body">
          {entry.type === 'clip' ? (
            <section className="drawer-section" aria-labelledby={`drawer-original-${entry.id}`}>
              <div className="drawer-section-head">
                <h3 id={`drawer-original-${entry.id}`}>
                  <TextQuote size={13} aria-hidden /> {uiText('library.originalText')}
                </h3>
                <span className="drawer-section-space" aria-hidden />
                {contentLocked ? (
                  // the short badge says how many marks hold the text; the whole sentence sits in the title and for readers (extension.md §4.1)
                  <span className="drawer-lock" data-testid="drawer-lock" title={uiText('reading.locked')}>
                    <Lock size={12} aria-hidden /> <span aria-hidden>{uiText('library.originalReadOnly', { count: highlightCount })}</span>
                    <span className="sr-only">{uiText('reading.locked')}</span>
                  </span>
                ) : (
                  editing !== 'content' && (
                    <button type="button" className="link" data-testid="edit-original" aria-label={uiText('library.editOriginal')} onClick={() => startEdit('content')}>
                      {uiText('library.edit')}
                    </button>
                  )
                )}
              </div>
              {editing === 'content' ? (
                editor(10, uiText('library.originalMarkdown'))
              ) : (
                <HighlightSurface
                  entry={entry}
                  defaultColor={defaultColor}
                  onEntryChanged={next => {
                    setEntry(next)
                    onEntryChanged()
                  }}
                />
              )}
              {entry.context && (
                <div className="drawer-context">
                  <div className="drawer-context-head">
                    <b>{uiText('library.context')}</b>
                    {editing !== 'context' && (
                      <button type="button" className="link" data-testid="edit-context" aria-label={uiText('library.editContext')} onClick={() => startEdit('context')}>
                        {uiText('library.edit')}
                      </button>
                    )}
                  </div>
                  {editing === 'context' ? editor(4, uiText('library.context')) : <p>{entry.context}</p>}
                </div>
              )}
            </section>
          ) : (
            <section className="drawer-section" aria-label={uiText('library.image')}>
              <div className="drawer-section-head">
                <h3>
                  <Image size={13} aria-hidden /> {uiText('library.image')}
                </h3>
                <span className="drawer-section-space" aria-hidden />
                {assetUrl && (
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => void chrome.downloads.download({ url: assetUrl, filename: `AnnHub/screenshot-${entry.id}.png`, saveAs: false })}
                  >
                    <Download size={14} aria-hidden /> {uiText('shot.tool.download')}
                  </button>
                )}
              </div>
              {assetMissing ? (
                <p className="warn">{uiText('library.imageMissing')}</p>
              ) : assetUrl ? (
                <button type="button" className="drawer-image-button" onClick={() => setImageZoom(true)} aria-label={uiText('library.imagePreview')}>
                  <img className="drawer-image" src={assetUrl} alt={String(entry.properties['title'] ?? '')} />
                </button>
              ) : (
                <p className="hint">{uiText('common.loading')}</p>
              )}
            </section>
          )}
          <section className="drawer-section">
            <h3>
              <MessageSquareText size={13} aria-hidden /> {uiText('library.note')}
            </h3>
            <textarea value={note} onChange={event => setNote(event.target.value)} onBlur={() => void persist()} placeholder={uiText('library.notePlaceholder')} rows={2} />
          </section>
          <section className="drawer-section drawer-section-last">
            <h3>
              <Tags size={13} aria-hidden /> {uiText('library.properties')}
            </h3>
            <PropertyPanel
              ref={propertyPanel}
              entry={entry}
              registry={registry}
              onEntryChanged={next => {
                setEntry(next)
                onEntryChanged()
              }}
            />
          </section>
          {error && <p className="drawer-error warn">{error}</p>}
        </div>
        {confirmDelete && (
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`confirm-title-${entry.id}`}
            aria-describedby={highlightCount > 0 ? `confirm-text-${entry.id}` : undefined}
            // a press on the scrim keeps the focus where the trap put it instead of dropping it to the page
            onMouseDown={event => event.preventDefault()}
            // the scrim itself is a way out: like Esc and 取消 it cancels and gives the keyboard back to 删除
            onClick={event => {
              if (event.target === event.currentTarget) closeConfirm()
            }}
            onKeyDownCapture={event => {
              // while the confirm is open it owns the keyboard: Esc cancels the confirm (not the drawer),
              // Tab stays between the two buttons — the same capture the image zoom uses
              if (event.key === 'Escape') {
                event.stopPropagation()
                closeConfirm()
                return
              }
              if (event.key === 'Tab') {
                event.stopPropagation()
                event.preventDefault()
                ;(document.activeElement === confirmDeleteButton.current ? confirmCancelButton : confirmDeleteButton).current?.focus()
              }
            }}
          >
            <div className="modal-card">
              <h2 className="modal-title" id={`confirm-title-${entry.id}`}>
                {highlightCount > 0 ? uiText('library.deleteClipTitle') : uiText('library.deleteConfirm')}
              </h2>
              {highlightCount > 0 && <p id={`confirm-text-${entry.id}`}>{boldenCount(uiText('library.deleteHighlightsBody', { count: highlightCount }), highlightCount)}</p>}
              <div className="modal-actions">
                <button type="button" className="ghost quiet" ref={confirmCancelButton} autoFocus onClick={closeConfirm}>
                  {uiText('common.cancel')}
                </button>
                <button
                  type="button"
                  className="danger"
                  ref={confirmDeleteButton}
                  onClick={() => {
                    void MessageUtils.sendMessage({ type: 'DELETE_ENTRY', id: entry.id }).then(response => {
                      if (!response.success) {
                        // the drawer and the entry survive; the user can retry
                        setError(entryErrorText(response.error))
                        closeConfirm()
                        return
                      }
                      onDeleted()
                      onClose()
                    })
                  }}
                >
                  {highlightCount > 0 && <Trash2 size={14} aria-hidden />}
                  {highlightCount > 0 ? uiText('library.deleteWithHighlightsButton') : uiText('library.delete')}
                </button>
              </div>
            </div>
          </div>
        )}
        {imageZoom && assetUrl && (
          <div
            className="image-zoom"
            role="dialog"
            aria-modal="true"
            aria-label={uiText('library.imagePreview')}
            onKeyDownCapture={event => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setImageZoom(false)
              }
            }}
          >
            <button type="button" className="ghost" onClick={() => setImageZoom(false)} aria-label={uiText('common.close')}>
              <X size={18} aria-hidden />
            </button>
            <img src={assetUrl} alt={String(entry.properties['title'] ?? '')} />
          </div>
        )}
      </aside>
    </>
  )
}
