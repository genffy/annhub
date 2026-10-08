/**
 * The settings view inside the application page (extension.md §2.5):
 * preferences (block entry + disabled sites, screenshot anonymize
 * default), shortcuts display, data (export entry lives in the nav, here
 * storage usage and the orphan report), and the local-metrics readout —
 * aggregate numbers only, nothing readable. The screenshot output section
 * (formats, watermark, ratio presets, beautify) rides the same settings
 * object; see screenshot.ts for its shape.
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { ExtensionSettings } from '../../background-service/settings-schema'
import type { OrphanReport } from '../../learning-core/store'
import { uiText } from '../../utils/ui-text'

export function SettingsView() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [orphans, setOrphans] = useState<OrphanReport | null>(null)
  const [metrics, setMetrics] = useState<Record<string, { total: number; byProps: Record<string, number> }> | null>(null)

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

  const loadMetrics = useCallback(async () => {
    const response = await MessageUtils.sendMessage<Record<string, { total: number; byProps: Record<string, number> }>>({ type: 'GET_METRICS' })
    if (response.success) setMetrics(response.data!)
  }, [])

  if (!settings) {
    return <div className="settings-view">{uiText('common.loading')}</div>
  }

  return (
    <div className="settings-view" data-testid="settings-view">
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
          {uiText('settings.orphanReport')}
        </button>
        {orphans && (
          <p className="hint" data-testid="orphan-report">
            {uiText('settings.orphanUnreferenced')}: {orphans.unreferencedAssets.length} · {uiText('settings.orphanMissing')}: {orphans.entriesWithMissingAssets.length}
          </p>
        )}
      </section>

      <section>
        <h2>{uiText('settings.metrics')}</h2>
        <p className="hint">{uiText('settings.metricsHint')}</p>
        <button type="button" onClick={() => void loadMetrics()}>
          {uiText('settings.metricsRefresh')}
        </button>
        {metrics && (
          <table className="props-table" data-testid="metrics-table">
            <tbody>
              {Object.entries(metrics)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, bucket]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{bucket.total}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
