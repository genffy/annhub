/**
 * Selection mode for the three entry lists (download.md §3.2): the state the
 * App shell no longer holds itself — which entries are picked, the
 * Shift-click range, the whole-filter pick under its cap, the Esc that
 * leaves (when nothing modal sits above), and the emptying on any view,
 * filter or search change. The selection never enters the URL.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { EntryQuery } from '../../core/query'
import type { EntryRecord } from '../../core/types'
import { DOWNLOAD_LIMITS } from '../../core/download'

export interface SelectionMode {
  selecting: boolean
  selectedIds: string[]
  enter(): void
  toggle(entry: EntryRecord, shift: boolean): void
  selectAll(): Promise<void>
  clear(): void
  exit(): void
}

/** `listQueryKey` empties the selection whenever the route's query changes (view, filters, search). */
export function useSelectionMode(listQueryKey: string, items: EntryRecord[], queryFor: () => EntryQuery): SelectionMode {
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const lastSelected = useRef<string | null>(null)
  const revision = useRef(0)

  useEffect(() => {
    revision.current++
    // the selection belongs to the list on screen: another view, filter or search starts it over (download.md §3.2)
    setSelecting(false)
    setSelectedIds([])
    lastSelected.current = null
  }, [listQueryKey])

  const enter = useCallback(() => {
    revision.current++
    setSelecting(true)
    setSelectedIds([])
    lastSelected.current = null
  }, [])

  const toggle = useCallback(
    (entry: EntryRecord, shift: boolean) => {
      revision.current++
      // read the anchor before the update: React may run the updater during render, after the ref moved
      const anchor = lastSelected.current
      setSelectedIds(prev => {
        // Shift takes the range from the last pick in the visible order
        if (shift && anchor && anchor !== entry.id) {
          const from = items.findIndex(item => item.id === anchor)
          const to = items.findIndex(item => item.id === entry.id)
          if (from !== -1 && to !== -1) {
            const [lo, hi] = from < to ? [from, to] : [to, from]
            const range = items.slice(lo, hi + 1).map(item => item.id)
            return [...new Set([...prev, ...range])].slice(0, DOWNLOAD_LIMITS.libraryMaxEntries)
          }
        }
        const index = prev.indexOf(entry.id)
        if (index !== -1) return prev.filter(id => id !== entry.id)
        // full: the card is aria-disabled and does not take the pick (download.md §3.2)
        if (prev.length >= DOWNLOAD_LIMITS.libraryMaxEntries) return prev
        return [...prev, entry.id]
      })
      lastSelected.current = entry.id
    },
    [items],
  )

  const selectAll = useCallback(async () => {
    const requestedAt = ++revision.current
    const { default: MessageUtils } = await import('../../utils/message')
    const response = await MessageUtils.sendMessage<{ result: { items: EntryRecord[] } }>({
      type: 'QUERY_ENTRIES',
      query: { ...queryFor(), limit: DOWNLOAD_LIMITS.libraryMaxEntries },
    })
    if (!response.success || requestedAt !== revision.current) return
    setSelectedIds(response.data!.result.items.map(item => item.id).slice(0, DOWNLOAD_LIMITS.libraryMaxEntries))
  }, [queryFor])

  const clear = useCallback(() => {
    revision.current++
    setSelectedIds([])
  }, [])

  const exit = useCallback(() => {
    revision.current++
    setSelecting(false)
    setSelectedIds([])
    lastSelected.current = null
  }, [])

  return { selecting, selectedIds, enter, toggle, selectAll, clear, exit }
}

/** Esc leaves selection mode — only when nothing modal is open above it (download.md §3.2). */
export function useSelectionEscape(active: boolean, blocked: boolean, exit: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (!active || blocked) return
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused.closest('input, textarea, select, [contenteditable]') !== null) return
      event.preventDefault()
      exit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, blocked, exit])
}
