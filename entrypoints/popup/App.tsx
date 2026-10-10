/**
 * Toolbar popup — the compact shell (extension.md §2.6): left icon rail with
 * counts (all / clips / highlights / screenshots, settings below), right the
 * five most recent entries of the selected kind (highlights show quote +
 * clip), "open in library", and the shortcut hint. It is also the fallback
 * entry where in-page surfaces cannot run (chrome:// and friends). No
 * editing here.
 */
import { useCallback, useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import MessageUtils from '../../utils/message'
import type { EntryQueryResult, HighlightQueryResult } from '../../learning-core/query'
import type { EntryRecord } from '../../learning-core/types'
import { relativeTime } from '../../utils/relative-time'
import { uiText } from '../../utils/ui-text'
import { extensionPageUrl } from '../../utils/extension-pages'
import { TypeChip, VIEW_ICONS } from '../../utils/entry-icons'

type Tab = 'all' | 'clips' | 'highlights' | 'screenshots'

const TABS: { tab: Tab; labelKey: 'library.all' | 'library.clips' | 'library.highlights' | 'library.screenshots'; Icon: LucideIcon }[] = [
  { tab: 'all', labelKey: 'library.all', Icon: VIEW_ICONS.all },
  { tab: 'clips', labelKey: 'library.clips', Icon: VIEW_ICONS.clips },
  { tab: 'highlights', labelKey: 'library.highlights', Icon: VIEW_ICONS.highlights },
  { tab: 'screenshots', labelKey: 'library.screenshots', Icon: VIEW_ICONS.screenshots },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('all')
  const [entries, setEntries] = useState<EntryRecord[]>([])
  const [highlightRows, setHighlightRows] = useState<HighlightQueryResult['groups']>([])
  const [counts, setCounts] = useState<Record<Tab, number>>({ all: 0, clips: 0, highlights: 0, screenshots: 0 })

  const load = useCallback(async () => {
    const [all, clips, highlights, screenshots] = await Promise.all([
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { limit: 5 } }),
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { types: ['clip'], limit: 5 } }),
      MessageUtils.sendMessage<{ result: HighlightQueryResult }>({ type: 'QUERY_HIGHLIGHTS', query: {} }),
      MessageUtils.sendMessage<{ result: EntryQueryResult }>({ type: 'QUERY_ENTRIES', query: { types: ['screenshot'], limit: 5 } }),
    ])
    setCounts({
      all: all.data?.result.total ?? 0,
      clips: clips.data?.result.total ?? 0,
      highlights: highlights.data?.result.total ?? 0,
      screenshots: screenshots.data?.result.total ?? 0,
    })
    setEntries((tab === 'clips' ? clips : tab === 'screenshots' ? screenshots : all).data?.result.items.slice(0, 5) ?? [])
    setHighlightRows((highlights.data?.result.groups ?? []).slice(0, 3))
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  const openLibrary = (view: string) => void chrome.tabs.create({ url: chrome.runtime.getURL(`library.html#/${view}`) })
  const openEntry = (id: string) => void chrome.tabs.create({ url: extensionPageUrl('library', { entryId: id }) })

  return (
    <main className="popup-shell">
      <nav className="popup-rail" aria-label={uiText('library.openLibrary')}>
        {TABS.map(({ tab: item, labelKey, Icon }) => (
          <button
            key={item}
            type="button"
            className={`popup-rail-item${tab === item ? ' popup-rail-current' : ''}`}
            aria-label={`${uiText(labelKey)} ${counts[item]}`}
            aria-current={tab === item ? 'true' : undefined}
            title={`${uiText(labelKey)} · ${counts[item]}`}
            onClick={() => setTab(item)}
          >
            <Icon size={17} aria-hidden />
            {counts[item] > 0 && <span className="popup-badge">{counts[item]}</span>}
          </button>
        ))}
        <span className="popup-rail-spacer" />
        <button type="button" className="popup-rail-item" aria-label={uiText('library.settings')} title={uiText('library.settings')} onClick={() => openLibrary('settings')}>
          <VIEW_ICONS.settings size={17} aria-hidden />
        </button>
      </nav>

      <section className="popup-body">
        <header className="popup-head">
          <span>
            {uiText(TABS.find(candidate => candidate.tab === tab)!.labelKey)} · {counts[tab]}
          </span>
          <button type="button" className="link" onClick={() => openLibrary(tab)}>
            {uiText('library.openLibrary')}
          </button>
        </header>

        {tab === 'highlights' ? (
          <ul className="popup-list">
            {highlightRows.flatMap(group =>
              group.rows.slice(0, 2).map(row => (
                <li key={row.highlight.id}>
                  <button type="button" onClick={() => openEntry(group.clip.id)}>
                    <span className="popup-quote">{row.highlight.quote}</span>
                    <span className="popup-meta">{group.clip.sourceHost}</span>
                  </button>
                </li>
              )),
            )}
            {highlightRows.length === 0 && <li className="popup-empty">{uiText('library.empty.highlights')}</li>}
          </ul>
        ) : (
          <ul className="popup-list">
            {entries.map(entry => (
              <li key={entry.id}>
                <button type="button" onClick={() => openEntry(entry.id)} title={String(entry.properties['title'] ?? '')}>
                  <TypeChip type={entry.type} />
                  <span className="popup-title">{String(entry.properties['title'] ?? '')}</span>
                  <span className="popup-meta">{relativeTime(entry.createdAt)}</span>
                </button>
              </li>
            ))}
            {entries.length === 0 && <li className="popup-empty">{uiText('library.empty')}</li>}
          </ul>
        )}

        <footer className="popup-foot">{uiText('library.shortcutHint')}</footer>
      </section>
    </main>
  )
}
