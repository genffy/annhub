/**
 * Settings page — the R1 slice of extension.md §2.5: block-clip entry
 * toggle and disabled-site list, the screenshot anonymize default, the
 * shortcut display, and the data block (storage usage, orphan-asset
 * report). The full settings page with screenshot output preferences is
 * part of R2.
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../utils/message'
import { uiText } from '../../utils/ui-text'
import type { ExtensionSettings } from '../../background-service/settings-schema'
import type { OrphanReport } from '../../learning-core/store'

function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [orphans, setOrphans] = useState<OrphanReport | null>(null)

  useEffect(() => {
    void MessageUtils.sendMessage<ExtensionSettings>({ type: 'GET_SETTINGS' }).then(response => {
      if (response.success) setSettings(response.data!)
    })
    void MessageUtils.sendMessage<{ usage: number; quota: number }>({ type: 'USAGE_ESTIMATE' }).then(response => {
      if (response.success) setUsage(response.data!)
    })
  }, [])

  const patch = useCallback(async (next: Partial<ExtensionSettings>) => {
    const response = await MessageUtils.sendMessage<ExtensionSettings>({ type: 'SET_SETTINGS', patch: next })
    if (response.success) setSettings(response.data!)
  }, [])

  const loadOrphans = useCallback(async () => {
    const response = await MessageUtils.sendMessage<OrphanReport>({ type: 'ORPHAN_REPORT' })
    if (response.success) setOrphans(response.data!)
  }, [])

  if (!settings) {
    return <main className="settings">{uiText('common.loading')}</main>
  }

  return (
    <main className="settings">
      <h1>{uiText('settings.title')}</h1>

      <section>
        <h2>{uiText('settings.blockEntry')}</h2>
        <p className="hint">{uiText('settings.blockEntryHint')}</p>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.blockEntryEnabled}
            onChange={event => void patch({ blockEntryEnabled: event.target.checked })}
            data-testid="block-entry-toggle"
          />
          <span>{uiText(settings.blockEntryEnabled ? 'shot.on' : 'shot.off')}</span>
        </label>
        {settings.blockDisabledSites.length > 0 && (
          <div className="sites">
            <h3>{uiText('settings.disabledSites')}</h3>
            <ul>
              {settings.blockDisabledSites.map(site => (
                <li key={site}>
                  {site}
                  <button type="button" onClick={() => void patch({ blockDisabledSites: settings.blockDisabledSites.filter(item => item !== site) })}>
                    {uiText('settings.remove')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2>{uiText('settings.anonymize')}</h2>
        <p className="hint">{uiText('settings.anonymizeHint')}</p>
        <label className="switch-row">
          <input type="checkbox" checked={settings.anonymizeDefault} onChange={event => void patch({ anonymizeDefault: event.target.checked })} data-testid="anonymize-toggle" />
          <span>{uiText(settings.anonymizeDefault ? 'shot.on' : 'shot.off')}</span>
        </label>
      </section>

      <section>
        <h2>{uiText('settings.shortcuts')}</h2>
        <p className="hint">{uiText('settings.shortcutsHint')}</p>
        <p className="keys">
          <kbd>Ctrl/Cmd+Shift+S</kbd> · <kbd>Ctrl/Cmd+Shift+E</kbd>
        </p>
      </section>

      <section>
        <h2>{uiText('settings.data')}</h2>
        {usage && usage.quota > 0 && (
          <p className="hint">
            {usage.usage / 1024 / 1024 >= 1 ? `${(usage.usage / 1024 / 1024).toFixed(1)} MB` : `${Math.round(usage.usage / 1024)} KB`} /{' '}
            {(usage.quota / 1024 / 1024 / 1024).toFixed(1)} GB
          </p>
        )}
        <button type="button" onClick={() => void loadOrphans()}>
          {uiText('settings.metrics')}
        </button>
        {orphans && (
          <p className="hint" data-testid="orphan-report">
            {orphans.unreferencedAssets.length} / {orphans.entriesWithMissingAssets.length}
          </p>
        )}
        <a href={chrome.runtime.getURL('library.html')}>{uiText('library.openLibrary')}</a>
      </section>
    </main>
  )
}

export default App
