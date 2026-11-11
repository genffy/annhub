/**
 * Toolbar popup — the compact shell (extension.md §2.6): left icon rail with
 * counts (all / clips / highlights / screenshots, settings below), right the
 * five most recent entries of the selected kind (highlights show quote +
 * clip), "open in library", and the shortcut hint with keycaps. It is also the
 * fallback entry where in-page surfaces cannot run (chrome:// and friends). No
 * editing here.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, CircleStop, Download, Info, Mic, PenLine, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import MessageUtils from '../../utils/message'
import type { RecordingState, TabMessage } from '../../types/messages'
import type { HighlightQueryResult } from '../../core/query'
import type { EntryRecord } from '../../core/types'
import { relativeTime } from './ui-text'
import { uiText } from './ui-text'
import { extensionPageUrl } from '../../utils/extension-pages'
import { TypeTile, VIEW_ICONS } from '../../utils/entry-icons'
import { ANN_SCREENSHOT_COMMAND } from '../../constants'

type Tab = 'all' | 'clips' | 'highlights' | 'screenshots'

/** The elapsed time of the live recording, as the popup's 03:12 (extension.md §2.6). */
function elapsed(startedAt: number | undefined, now: number): string {
  if (!startedAt) return '00:00'
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(minutes)}:${pad(seconds % 60)}`
}

/**
 * One keycap per key of the browser's binding: it reports either "+"-joined
 * names ("Ctrl+Shift+S") or bare glyphs ("⌘⇧S").
 */
function keycaps(binding: string): string[] {
  if (binding.includes('+'))
    return binding
      .split('+')
      .map(key => key.trim())
      .filter(Boolean)
  return [...binding]
}

/** The shortcut hint with its key segment drawn as keycaps; the copy itself never changes. */
function ShortcutHint({ binding }: { binding: string }) {
  const text = uiText('library.shortcutHint', { keys: binding })
  const [before, after] = binding && text.includes(binding) ? text.split(binding) : [text, '']
  return (
    <>
      {before}
      {keycaps(binding).map(key => (
        <kbd key={key}>{key}</kbd>
      ))}
      {after}
    </>
  )
}

type TabDef = { tab: Tab; labelKey: 'library.all' | 'library.clips' | 'library.highlights' | 'library.screenshots'; Icon: LucideIcon; tone?: 'clip' | 'highlight' | 'screenshot' }

const TABS: TabDef[] = [
  { tab: 'all', labelKey: 'library.all', Icon: VIEW_ICONS.all },
  { tab: 'clips', labelKey: 'library.clips', Icon: VIEW_ICONS.clips, tone: 'clip' },
  { tab: 'highlights', labelKey: 'library.highlights', Icon: VIEW_ICONS.highlights, tone: 'highlight' },
  { tab: 'screenshots', labelKey: 'library.screenshots', Icon: VIEW_ICONS.screenshots, tone: 'screenshot' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('all')
  const [entries, setEntries] = useState<EntryRecord[]>([])
  const [highlightRows, setHighlightRows] = useState<HighlightQueryResult['groups']>([])
  const [counts, setCounts] = useState<Record<Tab, number>>({ all: 0, clips: 0, highlights: 0, screenshots: 0 })
  // starts from the default binding and follows the browser's own assignment (extension.md §7.1)
  const [shortcutBinding, setShortcutBinding] = useState('Cmd/Ctrl+Shift+S')
  // The annotation and recording entries work on the pages the content script covers; chrome:// and
  // friends get the reason instead (annotate.md §1.1, §2.4 — the popup is the fallback where page
  // surfaces cannot run).
  const [canAnnotate, setCanAnnotate] = useState(false)
  const [recording, setRecording] = useState<RecordingState | null>(null)
  const [withMic, setWithMic] = useState(false)
  const [micNotice, setMicNotice] = useState<string | null>(null)
  // a start the worker or the browser refused: the popup stays open and says so, instead of closing as if it had begun
  const [startFailure, setStartFailure] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const activeUrl = useRef<string | null>(null)

  useEffect(() => {
    void chrome.commands.getAll().then(commands => {
      const binding = commands.find(command => command.name === ANN_SCREENSHOT_COMMAND)?.shortcut
      if (binding) setShortcutBinding(binding)
    })
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      try {
        const url = active?.url ? new URL(active.url) : null
        activeUrl.current = url?.protocol && ['http:', 'https:', 'file:'].includes(url.protocol) ? active!.url! : null
        setCanAnnotate(Boolean(activeUrl.current))
      } catch {
        activeUrl.current = null
        setCanAnnotate(false)
      }
    })
    void MessageUtils.sendMessage({ type: 'GET_SETTINGS' }).then(response => {
      if (response.success) setWithMic(response.data?.recording?.withMic === true)
    })
  }, [])

  // the recording state: the popup is open while recordings stop by themselves
  // (tab closed, limit hit), so it keeps the outcome (annotate.md §2.1)
  useEffect(() => {
    const poll = window.setInterval(() => {
      setNow(Date.now())
      void MessageUtils.sendMessage({ type: 'GET_RECORDING_STATE' }).then(response => {
        if (response.success) {
          setRecording(response.data ?? { status: 'idle', withMic: false })
          if (response.data?.micNotice) setMicNotice(uiText(`popup.recording.mic.${response.data.micNotice}` as 'popup.recording.mic.denied'))
        }
      })
    }, 1000)
    void MessageUtils.sendMessage({ type: 'GET_RECORDING_STATE' }).then(response => {
      if (response.success) setRecording(response.data ?? { status: 'idle', withMic: false })
    })
    return () => window.clearInterval(poll)
  }, [])

  const startRecording = useCallback(async () => {
    if (!activeUrl.current) return
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!active?.id) return
    if (withMic) {
      // the browser only asks for the microphone on a visible extension page:
      // without a live grant the settings page asks, this does not record (annotate.md §2.1)
      let granted
      try {
        granted = (await navigator.permissions.query({ name: 'microphone' })).state === 'granted'
      } catch {
        granted = false
      }
      if (!granted) {
        await MessageUtils.sendMessage({ type: 'OPEN_EXTENSION_PAGE', page: 'settings', params: { recordTabId: active.id } })
        window.close()
        return
      }
    }
    setStartFailure(null)
    let streamId: string | undefined
    try {
      // the stream id must be one the offscreen document can take (annotate.md §2.1):
      // targetTabId, not consumerTabId — a consumer-scoped id is only usable inside that tab
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: active.id })
    } catch {
      streamId = undefined
    }
    if (!streamId) {
      setStartFailure(uiText('popup.recording.failed'))
      return
    }
    const response = await MessageUtils.sendMessage({ type: 'START_RECORDING', tabId: active.id, streamId, withMic })
    if (!response.success) {
      setStartFailure(uiText('popup.recording.failed'))
      return
    }
    window.close()
  }, [withMic])

  const toggleMic = useCallback((checked: boolean) => {
    setWithMic(checked)
    void MessageUtils.sendMessage({ type: 'SET_SETTINGS', patch: { recording: { withMic: checked } } })
  }, [])

  const annotateThisPage = useCallback(async () => {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!active?.id) return
    const message: TabMessage = { type: 'TRIGGER_ANNOTATE' }
    await chrome.tabs.sendMessage(active.id, message, { frameId: 0 }).catch(() => undefined)
    window.close()
  }, [])

  // the page finds its main article and runs the download; its notice bar carries the progress (download.md §2.3)
  const downloadThisPage = useCallback(async () => {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!active?.id) return
    const message: TabMessage = { type: 'TRIGGER_DOWNLOAD_MAIN', via: 'popup' }
    await chrome.tabs.sendMessage(active.id, message, { frameId: 0 }).catch(() => undefined)
    window.close()
  }, [])

  const load = useCallback(async () => {
    const [all, clips, highlights, screenshots] = await Promise.all([
      MessageUtils.sendMessage({ type: 'QUERY_ENTRIES', query: { limit: 5 } }),
      MessageUtils.sendMessage({ type: 'QUERY_ENTRIES', query: { types: ['clip'], limit: 5 } }),
      MessageUtils.sendMessage({ type: 'QUERY_HIGHLIGHTS', query: {} }),
      MessageUtils.sendMessage({ type: 'QUERY_ENTRIES', query: { types: ['screenshot'], limit: 5 } }),
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
        {TABS.map(({ tab: item, labelKey, Icon, tone }) => (
          <button
            key={item}
            type="button"
            className={`popup-rail-item${tone ? ` popup-rail-${tone}` : ''}${tab === item ? ' popup-rail-current' : ''}`}
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
          <b>{uiText(TABS.find(candidate => candidate.tab === tab)!.labelKey)}</b>
          <span className="popup-recent">{uiText('popup.recent')}</span>
          <span className="popup-head-grow" />
          <button type="button" className="link" onClick={() => openLibrary(tab)}>
            {uiText('library.openLibrary')}
            <ArrowUpRight size={12} aria-hidden />
          </button>
        </header>

        {tab === 'highlights' ? (
          <ul className="popup-list">
            {/* the five most recent highlights across clips, each with its clip (extension.md §2.6) */}
            {highlightRows
              .flatMap(group => group.rows.map(row => ({ row, clip: group.clip })))
              .slice(0, 5)
              .map(({ row, clip }) => (
                <li key={row.highlight.id}>
                  <button type="button" onClick={() => openEntry(clip.id)} title={row.clipTitle}>
                    <TypeTile type="highlight" />
                    <span className="popup-rowtext">
                      <span className="popup-title">{row.highlight.quote}</span>
                      <span className="popup-meta">
                        {row.clipTitle} · {relativeTime(row.highlight.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            {highlightRows.length === 0 && <li className="popup-empty">{uiText('library.empty.highlights')}</li>}
          </ul>
        ) : (
          <ul className="popup-list">
            {entries.map(entry => (
              <li key={entry.id}>
                <button type="button" onClick={() => openEntry(entry.id)} title={String(entry.properties['title'] ?? '')}>
                  <TypeTile type={entry.type} />
                  <span className="popup-rowtext">
                    <span className="popup-title">{String(entry.properties['title'] ?? '')}</span>
                    <span className="popup-meta">
                      {entry.sourceHost} · {relativeTime(entry.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {entries.length === 0 && <li className="popup-empty">{uiText('library.empty')}</li>}
          </ul>
        )}

        {recording?.status === 'download-failed' ? (
          <div className="popup-actions" data-testid="popup-recording-failed">
            <span className="popup-recording-line">
              <CircleStop size={14} aria-hidden />
              {uiText('popup.recording.downloadFailed')}
            </span>
            <span className="popup-recording-buttons">
              <button type="button" onClick={() => void MessageUtils.sendMessage({ type: 'RETRY_RECORDING_DOWNLOAD' })}>
                {uiText('popup.recording.downloadAgain')}
              </button>
              <button type="button" className="popup-danger" onClick={() => void MessageUtils.sendMessage({ type: 'DISCARD_RECORDING' })}>
                {uiText('popup.recording.discard')}
              </button>
            </span>
          </div>
        ) : recording?.status === 'recording' ? (
          /* one line per piece of information (extension.md §2.6): status and time, then the tab's
             title, the microphone notice when there is one, the annotate entry, and the keys */
          <div className="popup-actions" data-testid="popup-recording">
            <span className="popup-recording-line">
              <span className="popup-rec" aria-hidden />
              {uiText('popup.recording.status', { time: elapsed(recording.startedAt, now) })}
              <span className="popup-recording-buttons">
                <button type="button" className="popup-danger" data-ann-ui="popup-record-stop" onClick={() => void MessageUtils.sendMessage({ type: 'STOP_RECORDING' })}>
                  {uiText('popup.recording.stop')}
                </button>
              </span>
            </span>
            <span className="popup-recording-title">{recording.tabTitle ?? ''}</span>
            {micNotice && <span className="popup-recording-mic">{micNotice}</span>}
            <button type="button" className="popup-annotate" data-ann-ui="popup-annotate" title={uiText('popup.annotate')} onClick={() => void annotateThisPage()}>
              <PenLine size={14} aria-hidden />
              {uiText('popup.annotate')}
            </button>
            <span className="popup-recording-keys">{uiText('popup.recording.keys')}</span>
          </div>
        ) : (
          <div className="popup-actions">
            {!canAnnotate && (
              /* the reason stays on the page, not only in the buttons' titles: keyboard and touch never see a title */
              <p className="popup-restricted">
                <Info size={14} aria-hidden />
                {uiText('popup.restricted.reason')}
              </p>
            )}
            <div className="popup-actions-row">
              <button
                type="button"
                data-ann-ui="popup-annotate"
                disabled={!canAnnotate}
                title={canAnnotate ? uiText('popup.annotate') : uiText('popup.annotate.restricted')}
                onClick={() => void annotateThisPage()}
              >
                <PenLine size={14} aria-hidden />
                {uiText('popup.annotate')}
              </button>
              <button
                type="button"
                data-ann-ui="popup-record"
                disabled={!canAnnotate}
                title={canAnnotate ? uiText('popup.record') : uiText('popup.record.restricted')}
                onClick={() => void startRecording()}
              >
                <Video size={14} aria-hidden />
                {uiText('popup.record')}
              </button>
              <button
                type="button"
                data-ann-ui="popup-download"
                disabled={!canAnnotate}
                title={canAnnotate ? uiText('popup.download') : uiText('popup.download.restricted')}
                onClick={() => void downloadThisPage()}
              >
                <Download size={14} aria-hidden />
                {uiText('popup.download')}
              </button>
              <label className="popup-mic" data-ann-ui="popup-mic">
                <input type="checkbox" checked={withMic} onChange={event => toggleMic(event.target.checked)} />
                <Mic size={13} aria-hidden />
                {uiText('popup.recording.withMic')}
              </label>
            </div>
          </div>
        )}
        {recording?.status === 'idle' && recording.limitNotice && (
          <p className="popup-recording-outcome" data-testid="popup-limit-notice">
            {uiText(recording.limitNotice === 'time' ? 'popup.recording.limitTime' : 'popup.recording.limitSize')}
          </p>
        )}
        {recording?.status === 'idle' && micNotice && <p className="popup-recording-outcome">{micNotice}</p>}
        {startFailure && <p className="popup-recording-outcome">{startFailure}</p>}
        {recording?.status === 'idle' && !recording.limitNotice && !micNotice && withMic && canAnnotate && (
          <p className="popup-recording-outcome">{uiText('popup.recording.headphones')}</p>
        )}

        <footer className="popup-foot">{canAnnotate ? <ShortcutHint binding={shortcutBinding} /> : uiText('popup.restricted.foot')}</footer>
      </section>
    </main>
  )
}
