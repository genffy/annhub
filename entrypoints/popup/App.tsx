/**
 * Toolbar popup — the fallback entry on pages where the in-page surfaces
 * cannot run (chrome://, store pages; extension.md §2.6, capture.md §3).
 * R1 keeps it to opening the library and the shortcut hint; the compact
 * shell with recent entries is R2.
 */
import { uiText } from '../../utils/ui-text'

function App() {
  return (
    <main className="popup">
      <button type="button" className="primary" data-testid="open-library" onClick={() => window.open(chrome.runtime.getURL('library.html'), '_blank')}>
        {uiText('library.openLibrary')}
      </button>
      <p className="hint">{uiText('library.shortcutHint')}</p>
    </main>
  )
}

export default App
