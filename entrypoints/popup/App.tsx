/**
 * Toolbar popup (extension.md §2.3): connection status, three entries and the
 * Desktop review hint. It is also the fallback entry on pages where the
 * in-page menu cannot run (chrome://). No review, editing or settings here.
 */
import { useEffect, useState } from 'react'
import { Images, Library, Lightbulb, type LucideIcon } from 'lucide-react'
import MessageUtils from '../../utils/message'
import { openExtensionPage, type ExtensionPage, type ExtensionPageParams } from '../../utils/extension-pages'
import type { Connection } from '../../utils/connection-status'
import type { FragmentStatsResponse, ScreenshotLibraryItem } from '../../types/messages'
import { popupViewModel, type PopupData } from './view-model'

interface DirectConnectResponse {
  status: { online: boolean; paired: boolean; detail: string }
  pending: { pendingFragments: number; pendingAssets: number }
  state: { lastError?: string; lastSyncAt?: number; lastPullAt?: number }
}

const EMPTY: PopupData = { connection: null, fragmentCount: null, dueCount: null, screenshotCount: null }

async function loadPopupData(): Promise<PopupData> {
  const [direct, stats, shots] = await Promise.all([
    MessageUtils.sendMessage<DirectConnectResponse>({ type: 'GET_DESKTOP_DIRECT_CONNECT' }),
    MessageUtils.sendMessage<FragmentStatsResponse>({ type: 'GET_FRAGMENT_STATS' }),
    MessageUtils.sendMessage<ScreenshotLibraryItem[]>({ type: 'GET_SCREENSHOTS' }),
  ])
  const connection: Connection | null =
    direct.success && direct.data ? { ...direct.data.status, ...direct.data.pending, lastError: direct.data.state.lastError, lastSyncAt: direct.data.state.lastSyncAt } : null
  return {
    connection,
    lastPullAt: direct.success ? direct.data?.state.lastPullAt : undefined,
    fragmentCount: stats.success && stats.data ? stats.data.total : null,
    dueCount: stats.success && stats.data ? stats.data.due : null,
    screenshotCount: shots.success && Array.isArray(shots.data) ? shots.data.length : null,
  }
}

function open(page: ExtensionPage, params?: ExtensionPageParams) {
  void openExtensionPage(page, params).then(() => window.close())
}

const isMac = /mac/i.test(navigator.platform ?? '')

export default function App() {
  const [data, setData] = useState<PopupData>(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void loadPopupData()
      .then(setData)
      .finally(() => setLoaded(true))
  }, [])

  const view = popupViewModel(data)
  const entries: Array<{ icon: LucideIcon; label: string; meta: string; onClick: () => void; testId: string }> = [
    { icon: Lightbulb, label: '新建灵感', meta: '无需选区', onClick: () => open('library', { new: 'inspiration' }), testId: 'popup-new-inspiration' },
    { icon: Library, label: '打开碎片库', meta: view.libraryCount ?? '', onClick: () => open('library'), testId: 'popup-open-library' },
    { icon: Images, label: '打开截图集', meta: view.screenshotCount ?? '', onClick: () => open('screenshots'), testId: 'popup-open-screenshots' },
  ]

  return (
    <main className="ann-popup" data-testid="popup" data-loaded={loaded}>
      <header className="ann-popup__header">
        <h1>AnnHub</h1>
        {view.status && (
          <p className="ann-popup__status" data-state={view.status.state} data-testid="popup-status">
            <span className="ann-popup__dot" aria-hidden="true" />
            {view.status.state === 'unpaired' ? `Desktop：${view.status.label}` : view.status.label}
          </p>
        )}
      </header>

      <nav className="ann-popup__menu" aria-label="AnnHub">
        {entries.map(entry => (
          <button key={entry.testId} type="button" className="ann-popup__item" onClick={entry.onClick} data-testid={entry.testId}>
            <span className="ann-popup__icon" aria-hidden="true">
              <entry.icon size={18} strokeWidth={2.1} />
            </span>
            <span className="ann-popup__label">{entry.label}</span>
            <span className="ann-popup__meta">{entry.meta}</span>
          </button>
        ))}
      </nav>

      {view.desktopReview && (
        <section className="ann-popup__desktop" data-testid="popup-desktop-review">
          <div>
            <strong>{view.desktopReview.text}</strong>
            <p>
              {view.desktopReview.estimate} / {view.desktopReview.source}
            </p>
          </div>
          <button type="button" className="ann-popup__action" onClick={() => open('library', { desktop: '1' })}>
            打开 Desktop
          </button>
        </section>
      )}

      <footer className="ann-popup__hint">选中网页文字即可保存 / {isMac ? 'Cmd' : 'Ctrl'}+Shift+S 截图</footer>
    </main>
  )
}
