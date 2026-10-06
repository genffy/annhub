/**
 * Toolbar popup (extension.md §2.3): three entries and a shortcut hint. It is
 * also the fallback entry on pages where the in-page menu cannot run
 * (chrome://). No editing or settings here.
 */
import { useEffect, useState } from 'react'
import { Images, Library, Lightbulb, type LucideIcon } from 'lucide-react'
import MessageUtils from '../../utils/message'
import { openExtensionPage, type ExtensionPage, type ExtensionPageParams } from '../../utils/extension-pages'
import type { FragmentStatsResponse, ScreenshotLibraryItem } from '../../types/messages'
import { uiText } from '../../utils/ui-text'
import { popupViewModel, type PopupData } from './view-model'

const EMPTY: PopupData = { fragmentCount: null, screenshotCount: null }

async function loadPopupData(): Promise<PopupData> {
  const [stats, shots] = await Promise.all([
    MessageUtils.sendMessage<FragmentStatsResponse>({ type: 'GET_FRAGMENT_STATS' }),
    MessageUtils.sendMessage<ScreenshotLibraryItem[]>({ type: 'GET_SCREENSHOTS' }),
  ])
  return {
    fragmentCount: stats.success && stats.data ? stats.data.total : null,
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
    {
      icon: Lightbulb,
      label: uiText('popup.newInspiration'),
      meta: uiText('popup.newInspiration.meta'),
      onClick: () => open('library', { new: 'inspiration' }),
      testId: 'popup-new-inspiration',
    },
    { icon: Library, label: uiText('popup.openLibrary'), meta: view.libraryCount ?? '', onClick: () => open('library'), testId: 'popup-open-library' },
    { icon: Images, label: uiText('popup.openScreenshots'), meta: view.screenshotCount ?? '', onClick: () => open('screenshots'), testId: 'popup-open-screenshots' },
  ]

  return (
    <main className="ann-popup" data-testid="popup" data-loaded={loaded}>
      <header className="ann-popup__header">
        <h1>AnnHub</h1>
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

      <footer className="ann-popup__hint">{uiText('popup.hint', { shortcut: `${isMac ? 'Cmd' : 'Ctrl'}+Shift+S` })}</footer>
    </main>
  )
}
