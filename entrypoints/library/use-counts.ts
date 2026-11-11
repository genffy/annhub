import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../utils/message'

/**
 * The navigation's numbers and candidates (RV-LIB-20, split out of App): the view counts, the
 * highlight total and the filter's host and tag candidates all come from one facets read, and
 * any successful write — in this tab or broadcast from another — refreshes them together with
 * the list (RV-LIB-03). Owns the numbers and the reload key the list query follows.
 */
export function useCounts() {
  const [counts, setCounts] = useState({ all: 0, clips: 0, screenshots: 0 })
  const [countsReady, setCountsReady] = useState(false)
  const [highlightTotal, setHighlightTotal] = useState(0)
  const [hosts, setHosts] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const refreshCounts = useCallback(async () => {
    const response = await MessageUtils.sendMessage({ type: 'QUERY_FACETS' })
    if (!response.success || !response.data?.facets) return
    const { counts: next, hosts: nextHosts, tags: nextTags } = response.data.facets
    setHosts(nextHosts)
    setTags(nextTags)
    setCounts({ all: next.all, clips: next.clips, screenshots: next.screenshots })
    setHighlightTotal(next.highlights)
    setCountsReady(true)
  }, [])

  /** Any successful write refreshes list, counts and candidates together (RV-LIB-03). */
  const reload = useCallback(() => {
    setReloadKey(key => key + 1)
    void refreshCounts()
  }, [refreshCounts])

  // A clip or screenshot saved from a page tab while this library tab is open:
  // the background broadcasts the mutation, the list refreshes itself instead
  // of waiting for a reload.
  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('annhub.entries')
      channel.onmessage = () => reload()
    } catch {
      /* without the channel the page keeps its manual reload behaviour */
    }
    return () => channel?.close()
  }, [reload])

  useEffect(() => {
    void refreshCounts()
  }, [refreshCounts])

  return { counts, countsReady, highlightTotal, hosts, tags, reload, reloadKey }
}
