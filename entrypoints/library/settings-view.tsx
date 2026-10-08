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
import { RATIO_PRESETS, watermarkBox } from '../content/screenshot/output'
import { uiText } from '../../utils/ui-text'

function ScreenshotSection({ settings, patch }: { settings: ExtensionSettings; patch(next: Partial<ExtensionSettings>): Promise<void> }) {
  const watermarkPreviewRef = (node: HTMLCanvasElement | null) => {
    if (!node) return
    const ctx = node.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, node.width, node.height)
    ctx.fillStyle = '#e8ebef'
    ctx.fillRect(0, 0, node.width, node.height)
    const box = watermarkBox({ width: node.width, height: node.height }, settings.watermark)
    ctx.globalAlpha = settings.watermark.opacity
    ctx.fillStyle = '#20252b'
    ctx.font = `${box.fontSize}px -apple-system, system-ui, sans-serif`
    ctx.textAlign = settings.watermark.position.endsWith('right') ? 'right' : 'left'
    ctx.textBaseline = settings.watermark.position.startsWith('top') ? 'top' : 'bottom'
    ctx.fillText(settings.watermark.text || 'AnnHub', box.x, box.y)
    ctx.globalAlpha = 1
  }
  void watermarkPreviewRef

  return (
    <section>
      <h2>{uiText('settings.screenshot')}</h2>

      <h3>{uiText('settings.downloadFormat')}</h3>
      <div className="settings-inline">
        <select value={settings.downloadFormat} aria-label={uiText('settings.downloadFormat')} onChange={event => void patch({ downloadFormat: event.target.value as 'png' })}>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
        {settings.downloadFormat !== 'png' && (
          <label className="settings-inline">
            <span>{uiText('settings.quality')}</span>
            <input type="range" min={0.5} max={1} step={0.05} value={settings.downloadQuality} onChange={event => void patch({ downloadQuality: Number(event.target.value) })} />
            <span>{settings.downloadQuality.toFixed(2)}</span>
          </label>
        )}
      </div>

      <h3>{uiText('settings.watermark')}</h3>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={settings.watermark.enabled}
          onChange={event => void patch({ watermark: { ...settings.watermark, enabled: event.target.checked } })}
          data-testid="watermark-toggle"
        />
        <span>{uiText(settings.watermark.enabled ? 'shot.on' : 'shot.off')}</span>
      </label>
      <div className="settings-grid">
        <label>
          <span>{uiText('settings.watermarkText')}</span>
          <input
            type="text"
            maxLength={40}
            value={settings.watermark.text}
            onChange={event => void patch({ watermark: { ...settings.watermark, text: event.target.value } })}
            placeholder="AnnHub"
          />
        </label>
        <label>
          <span>{uiText('settings.watermarkImage')}</span>
          <input
            type="file"
            accept="image/png"
            onChange={event => {
              const file = event.target.files?.[0]
              if (!file || file.size > 512 * 1024) return
              const reader = new FileReader()
              reader.onload = () => void patch({ watermark: { ...settings.watermark, image: String(reader.result) } })
              reader.readAsDataURL(file)
            }}
          />
        </label>
        <label>
          <span>{uiText('settings.position')}</span>
          <select value={settings.watermark.position} onChange={event => void patch({ watermark: { ...settings.watermark, position: event.target.value as 'bottom-right' } })}>
            <option value="top-left">↖</option>
            <option value="top-right">↗</option>
            <option value="bottom-left">↙</option>
            <option value="bottom-right">↘</option>
          </select>
        </label>
        <label>
          <span>{uiText('settings.size')}</span>
          <select value={settings.watermark.size} onChange={event => void patch({ watermark: { ...settings.watermark, size: event.target.value as 'medium' } })}>
            <option value="small">{uiText('settings.size.small')}</option>
            <option value="medium">{uiText('settings.size.medium')}</option>
            <option value="large">{uiText('settings.size.large')}</option>
          </select>
        </label>
        <label>
          <span>{uiText('settings.opacity')}</span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={settings.watermark.opacity}
            onChange={event => void patch({ watermark: { ...settings.watermark, opacity: Number(event.target.value) } })}
          />
          <span>{Math.round(settings.watermark.opacity * 100)}%</span>
        </label>
      </div>
      <canvas ref={watermarkPreviewRef} width={260} height={90} className="watermark-preview" data-testid="watermark-preview" />

      <h3>{uiText('settings.ratioPresets')}</h3>
      <div className="settings-inline">
        {RATIO_PRESETS.map(preset => (
          <label key={preset.id} className="prop-preset">
            <input
              type="checkbox"
              checked={settings.ratioPresets.includes(preset.id)}
              onChange={event => {
                const next = event.target.checked ? [...settings.ratioPresets, preset.id] : settings.ratioPresets.filter(id => id !== preset.id)
                void patch({ ratioPresets: next })
              }}
            />
            {preset.id}
          </label>
        ))}
      </div>

      <h3>{uiText('settings.beautify')}</h3>
      <label className="switch-row">
        <input type="checkbox" checked={settings.beautify.enabled} onChange={event => void patch({ beautify: { ...settings.beautify, enabled: event.target.checked } })} />
        <span>{uiText(settings.beautify.enabled ? 'shot.on' : 'shot.off')}</span>
      </label>
      <div className="settings-grid">
        <label>
          <span>{uiText('settings.background')}</span>
          <select value={settings.beautify.background} onChange={event => void patch({ beautify: { ...settings.beautify, background: event.target.value as 'solid-white' } })}>
            <option value="none">{uiText('settings.background.none')}</option>
            <option value="solid-white">{uiText('settings.background.solid')} A</option>
            <option value="solid-ivory">{uiText('settings.background.solid')} B</option>
            <option value="grad-purple">{uiText('settings.background.grad')} 1</option>
            <option value="grad-blue">{uiText('settings.background.grad')} 2</option>
            <option value="grad-green">{uiText('settings.background.grad')} 3</option>
            <option value="grad-sunset">{uiText('settings.background.grad')} 4</option>
            <option value="grad-slate">{uiText('settings.background.grad')} 5</option>
          </select>
        </label>
        <label>
          <span>{uiText('settings.padding')}</span>
          <select value={settings.beautify.padding} onChange={event => void patch({ beautify: { ...settings.beautify, padding: event.target.value as 'medium' } })}>
            <option value="small">24</option>
            <option value="medium">40</option>
            <option value="large">64</option>
          </select>
        </label>
        <label>
          <span>{uiText('settings.radius')}</span>
          <select value={settings.beautify.radius} onChange={event => void patch({ beautify: { ...settings.beautify, radius: Number(event.target.value) } })}>
            <option value={0}>0</option>
            <option value={12}>12</option>
            <option value={24}>24</option>
          </select>
        </label>
        <label className="prop-preset">
          <input type="checkbox" checked={settings.beautify.shadow} onChange={event => void patch({ beautify: { ...settings.beautify, shadow: event.target.checked } })} />
          <span>{uiText('settings.shadow')}</span>
        </label>
      </div>
    </section>
  )
}

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

      <ScreenshotSection settings={settings} patch={patch} />

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
