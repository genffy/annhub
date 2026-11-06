/**
 * The list views' selection mode and the library's one download run
 * (download.md §3.1–§3.3): which entries are picked, the Shift range, the
 * whole-filter pick under the 200-entry cap, the Ctrl/Cmd+A key, the Esc that
 * leaves, the dialog's open state, the busy and auto-dismiss timers, and the
 * two focus anchors. The App shell only wires it to the header, the cards and
 * the downloads layer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { EntryQuery } from '../../core/query'
import type { EntryRecord } from '../../core/types'
import { DOWNLOAD_LIMITS } from '../../core/download'
import { useLibraryDownload, type LibraryDownload } from './download-client'
import { useSelectionEscape, useSelectionMode } from './selection-mode'

export interface SelectionController {
  selecting: boolean
  selectedIds: string[]
  /** The current list's total, the cap's and the pick's number. */
  filteredTotal: number
  /** Every card is aria-disabled once the cap is reached and not picked (download.md §3.2). */
  atCap: boolean
  download: LibraryDownload
  dialogOpen: boolean
  selectButtonRef: React.RefObject<HTMLButtonElement | null>
  downloadButtonRef: React.RefObject<HTMLButtonElement | null>
  toggleSelection(): void
  exitSelection(): void
  selectAllVisible(): void
  toggleEntrySelection(entry: EntryRecord, shift: boolean): void
  clearSelection(): void
  openDownloadDialog(): void
  closeDownloadDialog(): void
}

export function useSelectionController(input: {
  listQueryKey: string
  items: EntryRecord[]
  total: number
  queryFor(): EntryQuery
  /** Saves and closes an open drawer: selection mode has no open drawer and unsaved input survives (download.md §3.2). */
  beforeEnter(): Promise<boolean>
  /** The drawer, the reading view and the export dialog own Escape before the selection does. */
  escapeBlocked: boolean
}): SelectionController {
  const { listQueryKey, items, total, queryFor, beforeEnter, escapeBlocked } = input
  const selection = useSelectionMode(listQueryKey, items, queryFor)
  const { selecting, selectedIds } = selection
  const download = useLibraryDownload()
  const [dialogOpen, setDialogOpen] = useState(false)
  const selectButtonRef = useRef<HTMLButtonElement>(null)
  const downloadButtonRef = useRef<HTMLButtonElement>(null)
  const atCap = selectedIds.length >= DOWNLOAD_LIMITS.libraryMaxEntries
  const entering = useRef<symbol | null>(null)
  useEffect(
    () => () => {
      entering.current = null
    },
    [listQueryKey],
  )

  /** Leaving selection returns the keyboard to its toggle (download.md §3.2). */
  const exitSelection = useCallback(() => {
    entering.current = null
    selection.exit()
    window.setTimeout(() => selectButtonRef.current?.focus(), 0)
  }, [selection])

  /** Entering saves and closes an open drawer first: selection mode has no open drawer. */
  const toggleSelection = useCallback(() => {
    if (selecting) {
      exitSelection()
      return
    }
    if (entering.current) return
    const attempt = Symbol()
    entering.current = attempt
    void beforeEnter().then(
      ok => {
        if (entering.current !== attempt) return
        entering.current = null
        if (ok) selection.enter()
      },
      () => {
        if (entering.current === attempt) entering.current = null
      },
    )
  }, [selecting, exitSelection, beforeEnter, selection])

  const selectAllVisible = useCallback(() => {
    if (total > DOWNLOAD_LIMITS.libraryMaxEntries) return
    void selection.selectAll()
  }, [total, selection])

  const toggleEntrySelection = useCallback((entry: EntryRecord, shift: boolean) => selection.toggle(entry, shift), [selection])

  useSelectionEscape(selecting, escapeBlocked || dialogOpen, exitSelection)

  // Ctrl/Cmd+A picks the whole filtered list under the cap (download.md §3.2); the browser's own select-all stays in inputs
  useEffect(() => {
    if (!selecting || dialogOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || (event.key !== 'a' && event.key !== 'A')) return
      const active = document.activeElement
      if (active instanceof HTMLElement && (active.closest('input, textarea, select, [contenteditable]') !== null || active.isContentEditable)) return
      event.preventDefault()
      if (total <= DOWNLOAD_LIMITS.libraryMaxEntries) void selection.selectAll()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selecting, dialogOpen, total, selection])

  // a finished single download leaves by itself; partial and failed stay until the user closes them (download.md §3.1)
  const dismissDownload = download.dismiss
  useEffect(() => {
    if (dialogOpen) return
    const phase = download.state.phase
    if (phase !== 'done' && phase !== 'cancelled') return
    const timer = window.setTimeout(dismissDownload, 4200)
    return () => window.clearTimeout(timer)
  }, [download.state.phase, dismissDownload, dialogOpen])

  // a run from an old surface must not leave its bar over the dialog's prepare state
  const openDownloadDialog = useCallback(() => {
    dismissDownload()
    setDialogOpen(true)
  }, [dismissDownload])

  const closeDownloadDialog = useCallback(() => {
    setDialogOpen(false)
    // the dialog took the keyboard from this button; closing gives it back (download.md §3.3)
    window.setTimeout(() => downloadButtonRef.current?.focus(), 0)
  }, [])

  return {
    selecting,
    selectedIds,
    filteredTotal: total,
    atCap,
    download,
    dialogOpen,
    selectButtonRef,
    downloadButtonRef,
    toggleSelection,
    exitSelection,
    selectAllVisible,
    toggleEntrySelection,
    clearSelection: selection.clear,
    openDownloadDialog,
    closeDownloadDialog,
  }
}
