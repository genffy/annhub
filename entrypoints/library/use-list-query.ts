import { useCallback, useEffect, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { EntryQuery } from '../../core/query'
import type { EntryRecord } from '../../core/types'
import { PAGE_SIZE } from './library-queries'

/**
 * The list view's query and its pages (RV-LIB-20, split out of App): the first page follows the
 * route's query (an unchanged query is never sent again), 显示更多 appends the next one, and a
 * reply that lost a race with a newer query is dropped. Owns the items, the totals and the race
 * sequence; the route, the registry and the reload key come in.
 */
export interface UseListQueryInput {
  /** False while a route without list controls is on screen. */
  active: boolean
  /** The query as JSON, or null while it must wait for the property registry. */
  queryJson: string | null
  /** Changes when the route's query itself changes, not on every render. */
  queryKey: string
  /** Bumped by writes: the same query is sent again (RV-LIB-03). */
  reloadKey: number
  /** The fresh query for the next page. */
  query: () => EntryQuery
  /** A user-caused query's answer total, for the search timing metric (RV-LIB-13). */
  onQueried?: (total: number) => void
}

export function useListQuery(input: UseListQueryInput) {
  const [items, setItems] = useState<EntryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const querySeq = useRef(0)
  const loadingMoreRef = useRef(false)
  const loadedCountRef = useRef(PAGE_SIZE)
  const lastQueryKeyRef = useRef<string | null>(null)
  /** The card the keyboard goes on once a late page landed (set by loadMore only, so a reload never moves the focus). */
  const focusAfterLoadRef = useRef<string | null>(null)

  const { active, queryJson, queryKey, reloadKey, query, onQueried } = input
  useEffect(() => {
    if (!active) return
    if (lastQueryKeyRef.current !== queryKey) {
      loadedCountRef.current = PAGE_SIZE
      lastQueryKeyRef.current = queryKey
    }
    const seq = ++querySeq.current
    setLoading(true)
    if (queryJson === null) return
    const parsed = JSON.parse(queryJson) as EntryQuery
    void (async () => {
      const response = await MessageUtils.sendMessage({ type: 'QUERY_ENTRIES', query: { ...parsed, limit: loadedCountRef.current } })
      if (seq !== querySeq.current) return
      if (response.success) {
        setItems(response.data!.result.items)
        setTotal(response.data!.result.total)
        setNextCursor(response.data!.result.nextCursor ?? null)
        loadedCountRef.current = Math.max(PAGE_SIZE, response.data!.result.items.length)
        onQueried?.(response.data!.result.total)
      }
      setLoading(false)
    })()
  }, [active, queryJson, queryKey, reloadKey, onQueried])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const seq = querySeq.current
      const response = await MessageUtils.sendMessage({ type: 'QUERY_ENTRIES', query: { ...query(), limit: PAGE_SIZE, cursor: nextCursor } })
      if (seq !== querySeq.current || !response.success) return
      const page = response.data!.result.items
      // an empty page (its entries deleted meanwhile) still takes the button away: the keyboard stays on the last card
      focusAfterLoadRef.current = (page[0] ?? items[items.length - 1])?.id ?? null
      setItems(prev => [...prev, ...page])
      loadedCountRef.current += page.length
      setTotal(response.data!.result.total)
      setNextCursor(response.data!.result.nextCursor ?? null)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [items, nextCursor, query])

  /** The card a finished page wants under the keyboard; taken once, before paint. */
  const takeFocusAfterLoad = useCallback(() => {
    const id = focusAfterLoadRef.current
    focusAfterLoadRef.current = null
    return id
  }, [])

  return { items, total, nextCursor, loading, loadingMore, loadMore, takeFocusAfterLoad }
}
