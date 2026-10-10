/**
 * The settings view inside the application page (extension.md §2.5):
 * preferences (block entry + disabled sites, screenshot anonymize
 * default), shortcuts display, data (export entry lives in the nav, here
 * storage usage and the orphan report), and the local-metrics readout —
 * aggregate numbers only, nothing readable. The screenshot output section
 * (formats, watermark, ratio presets, beautify) rides the same settings
 * object; see screenshot.ts for its shape.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { ExtensionSettings, SettingsPatch } from '../../background-service/settings-schema'
import { EntryStore, type OrphanReport } from '../../learning-core/store'
import { BEAUTIFY_BACKGROUND_IDS, BEAUTIFY_RADII, PADDING_PX, RATIO_PRESETS, watermarkBox, type BeautifyBackground, type BeautifyPadding } from '../content/screenshot/output'
import { formatBytes } from '../../utils/format-bytes'
import { uiText } from '../../utils/ui-text'
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../learning-core/types'
import { ANN_BLOCK_MODE_COMMAND, ANN_SCREENSHOT_COMMAND } from '../../constants'

/** The two browser commands the shortcut hint speaks of; the browser also lists the toolbar button's own command. */
const SHORTCUT_COMMANDS: readonly string[] = [ANN_SCREENSHOT_COMMAND, ANN_BLOCK_MODE_COMMAND]

function ScreenshotSection({ settings, patch }: { settings: ExtensionSettings; patch(next: SettingsPatch): Promise<boolean> }) {
  const imageInputId = useId()
  const [watermarkText, setWatermarkText] = useState(settings.watermark.text)
  const [quality, setQuality] = useState(settings.downloadQuality)
  const [opacity, setOpacity] = useState(settings.watermark.opacity)
  const [error, setError] = useState('')
  const watermarkDirty = useRef(false)
  const qualitySaved = useRef(settings.downloadQuality)
  const opacitySaved = useRef(settings.watermark.opacity)

  useEffect(() => {
    if (!watermarkDirty.current) setWatermarkText(settings.watermark.text)
    qualitySaved.current = settings.downloadQuality
    opacitySaved.current = settings.watermark.opacity
    setQuality(settings.downloadQuality)
    setOpacity(settings.watermark.opacity)
  }, [settings.downloadQuality, settings.watermark.opacity, settings.watermark.text])

  const saveText = async () => {
    if (!watermarkDirty.current) return
    const ok = await patch({ watermark: { text: watermarkText } })
    if (ok) {
      watermarkDirty.current = false
      setError('')
    } else setError(uiText('toast.saveFailed'))
  }
  const saveQuality = async (value: number) => {
    if (value === qualitySaved.current) return
    if (await patch({ downloadQuality: value })) qualitySaved.current = value
    else setError(uiText('toast.saveFailed'))
  }
  const saveOpacity = async (value: number) => {
    if (value === opacitySaved.current) return
    if (await patch({ watermark: { opacity: value } })) opacitySaved.current = value
    else setError(uiText('toast.saveFailed'))
  }

  const watermarkPreviewRef = (node: HTMLCanvasElement | null) => {
    if (!node) return
    const ctx = node.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, node.width, node.height)
    ctx.fillStyle = '#e8ebef'
    ctx.fillRect(0, 0, node.width, node.height)
    const box = watermarkBox({ width: node.width, height: node.height }, settings.watermark)
    ctx.globalAlpha = opacity
    ctx.fillStyle = '#20252b'
    ctx.font = `${box.fontSize}px -apple-system, system-ui, sans-serif`
    ctx.textAlign = settings.watermark.position.endsWith('right') ? 'right' : 'left'
    ctx.textBaseline = settings.watermark.position.startsWith('top') ? 'top' : 'bottom'
    ctx.fillText(watermarkText || 'AnnHub', box.x, box.y)
    ctx.globalAlpha = 1
  }
  void watermarkPreviewRef

  return (
    <section>
      <h2>{uiText('settings.screenshot')}</h2>

      <div className="settings-group">
        <h3>{uiText('settings.downloadFormat')}</h3>
        <div className="settings-inline">
          <select value={settings.downloadFormat} aria-label={uiText('settings.downloadFormat')} onChange={event => void patch({ downloadFormat: event.target.value as 'png' })}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
          {settings.downloadFormat !== 'png' && (
            <label className="settings-control settings-range">
              <span className="settings-label">{uiText('settings.quality')}</span>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.05}
                value={quality}
                onChange={event => setQuality(Number(event.target.value))}
                onPointerUp={event => void saveQuality(Number(event.currentTarget.value))}
                onKeyUp={event => void saveQuality(Number(event.currentTarget.value))}
                onBlur={event => void saveQuality(Number(event.currentTarget.value))}
              />
              <span className="settings-value">{quality.toFixed(2)}</span>
            </label>
          )}
        </div>
      </div>

      <div className="settings-group">
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
          <label className="settings-field">
            <span className="settings-label">{uiText('settings.watermarkText')}</span>
            <input
              type="text"
              maxLength={40}
              value={watermarkText}
              onChange={event => {
                watermarkDirty.current = true
                setWatermarkText(event.target.value)
              }}
              onBlur={() => void saveText()}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) void saveText()
              }}
              placeholder="AnnHub"
            />
          </label>
          {/* the remove button sits beside the chooser, outside the label: the label names the chooser only */}
          <div className="settings-field">
            <label className="settings-label" htmlFor={imageInputId}>
              {uiText('settings.watermarkImage')}
            </label>
            <span className="settings-control">
              <input
                id={imageInputId}
                type="file"
                accept="image/png"
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  if (file.size > 512 * 1024) {
                    setError(uiText('settings.error.imageTooLarge'))
                    return
                  }
                  setError('')
                  const reader = new FileReader()
                  reader.onload = () => void patch({ watermark: { ...settings.watermark, image: String(reader.result) } })
                  reader.readAsDataURL(file)
                }}
              />
              {settings.watermark.image && (
                <button type="button" className="ghost" onClick={() => void patch({ watermark: { image: null } })}>
                  {uiText('settings.remove')}
                </button>
              )}
            </span>
          </div>
          <label className="settings-field">
            <span className="settings-label">{uiText('settings.position')}</span>
            <select value={settings.watermark.position} onChange={event => void patch({ watermark: { ...settings.watermark, position: event.target.value as 'bottom-right' } })}>
              <option value="top-left">↖</option>
              <option value="top-right">↗</option>
              <option value="bottom-left">↙</option>
              <option value="bottom-right">↘</option>
            </select>
          </label>
          <label className="settings-field">
            <span className="settings-label">{uiText('settings.size')}</span>
            <select value={settings.watermark.size} onChange={event => void patch({ watermark: { ...settings.watermark, size: event.target.value as 'medium' } })}>
              <option value="small">{uiText('settings.size.small')}</option>
              <option value="medium">{uiText('settings.size.medium')}</option>
              <option value="large">{uiText('settings.size.large')}</option>
            </select>
          </label>
          <label className="settings-field">
            <span className="settings-label">{uiText('settings.opacity')}</span>
            <span className="settings-control settings-range">
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={opacity}
                onChange={event => setOpacity(Number(event.target.value))}
                onPointerUp={event => void saveOpacity(Number(event.currentTarget.value))}
                onKeyUp={event => void saveOpacity(Number(event.currentTarget.value))}
                onBlur={event => void saveOpacity(Number(event.currentTarget.value))}
              />
              <span className="settings-value">{Math.round(opacity * 100)}%</span>
            </span>
          </label>
          <div className="settings-field settings-field-top">
            <span className="settings-label" aria-hidden="true">
              {uiText('settings.preview')}
            </span>
            <canvas
              ref={watermarkPreviewRef}
              width={260}
              height={90}
              className="watermark-preview"
              role="img"
              aria-label={uiText('settings.preview')}
              data-testid="watermark-preview"
            />
          </div>
        </div>
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="settings-group">
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
      </div>

      <div className="settings-group">
        <h3>{uiText('settings.beautify')}</h3>
        <label className="switch-row">
          <input type="checkbox" checked={settings.beautify.enabled} onChange={event => void patch({ beautify: { ...settings.beautify, enabled: event.target.checked } })} />
          <span>{uiText(settings.beautify.enabled ? 'shot.on' : 'shot.off')}</span>
        </label>
        <div className="settings-grid">
          <label className="settings-field">
            <span className="settings-label">{uiText('settings.background')}</span>
            <select
              value={settings.beautify.background}
              onChange={event => void patch({ beautify: { ...settings.beautify, background: event.target.value as BeautifyBackground } })}
            >
              {BEAUTIFY_BACKGROUND_IDS.map(id => (
                <option key={id} value={id}>
                  {uiText(`shot.beautify.background.${id}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span className="settings-label">{uiText('settings.padding')}</span>
            <select value={settings.beautify.padding} onChange={event => void patch({ beautify: { ...settings.beautify, padding: event.target.value as BeautifyPadding } })}>
              {(Object.keys(PADDING_PX) as BeautifyPadding[]).map(size => (
                <option key={size} value={size}>
                  {uiText(`settings.size.${size}`)} · {PADDING_PX[size]}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span className="settings-label">{uiText('settings.radius')}</span>
            <select value={settings.beautify.radius} onChange={event => void patch({ beautify: { ...settings.beautify, radius: Number(event.target.value) } })}>
              {BEAUTIFY_RADII.map(radius => (
                <option key={radius} value={radius}>
                  {radius}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span className="settings-label">{uiText('settings.shadow')}</span>
            <input type="checkbox" checked={settings.beautify.shadow} onChange={event => void patch({ beautify: { ...settings.beautify, shadow: event.target.checked } })} />
          </label>
        </div>
      </div>
    </section>
  )
}

export function SettingsView() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [orphans, setOrphans] = useState<OrphanReport | null>(null)
  const [metrics, setMetrics] = useState<Record<string, { total: number; byProps: Record<string, number> }> | null>(null)
  const [shortcuts, setShortcuts] = useState<chrome.commands.Command[]>([])

  useEffect(() => {
    void MessageUtils.sendMessage<ExtensionSettings>({ type: 'GET_SETTINGS' }).then(response => {
      if (response.success) setSettings(response.data!)
    })
    void MessageUtils.sendMessage<{ usage: number; quota: number }>({ type: 'USAGE_ESTIMATE' }).then(response => {
      if (response.success) setUsage(response.data!)
    })
    void chrome.commands.getAll().then(commands => setShortcuts(commands.filter(command => SHORTCUT_COMMANDS.includes(command.name ?? ''))))
  }, [])

  const patch = useCallback(async (next: SettingsPatch): Promise<boolean> => {
    const response = await MessageUtils.sendMessage<ExtensionSettings>({ type: 'SET_SETTINGS', patch: next })
    if (response.success) setSettings(response.data!)
    return response.success
  }, [])

  const loadOrphans = useCallback(async () => {
    const response = await MessageUtils.sendMessage<OrphanReport>({ type: 'ORPHAN_REPORT' })
    if (response.success) setOrphans(response.data!)
  }, [])

  const cleanupOrphans = useCallback(async () => {
    const ids = orphans?.unreferencedAssets ?? []
    if (ids.length === 0 || !window.confirm(uiText('settings.orphanConfirm', { count: ids.length }))) return
    const store = new EntryStore('annhub')
    try {
      await store.initialize()
      await store.deleteOrphanAssets(ids)
      await loadOrphans()
    } finally {
      await store.close()
    }
  }, [orphans, loadOrphans])

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
        <h2>{uiText('settings.defaultHighlightColor')}</h2>
        <div className="hl-colors" role="group" aria-label={uiText('settings.defaultHighlightColor')}>
          {HIGHLIGHT_COLORS.map((color: HighlightColor) => (
            <button
              key={color}
              type="button"
              className={`hl-dot hl-dot-${color}${settings.defaultHighlightColor === color ? ' hl-dot-active' : ''}`}
              aria-label={uiText(`library.color.${color}`)}
              aria-pressed={settings.defaultHighlightColor === color}
              onClick={() => void patch({ defaultHighlightColor: color })}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>{uiText('settings.shortcuts')}</h2>
        <p className="hint">{uiText('settings.shortcutsHint')}</p>
        {shortcuts.map(command => (
          <p className="keys" key={command.name}>
            <span>{command.name === ANN_SCREENSHOT_COMMAND ? uiText('settings.shortcut.screenshot') : uiText('settings.shortcut.block')}</span>
            {command.shortcut ? <kbd>{command.shortcut}</kbd> : <span className="keys-unassigned">{uiText('settings.shortcut.unassigned')}</span>}
          </p>
        ))}
        <button type="button" className="link" onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
          {uiText('settings.shortcut.manage')}
        </button>
      </section>

      <section>
        <h2>{uiText('settings.data')}</h2>
        {usage && usage.quota > 0 && (
          <p className="hint">
            {formatBytes(usage.usage)} / {formatBytes(usage.quota)}
          </p>
        )}
        <button type="button" onClick={() => void loadOrphans()}>
          {uiText('settings.orphanReport')}
        </button>
        {orphans && (
          <div className="hint" data-testid="orphan-report">
            <p>
              {uiText('settings.orphanUnreferenced')}: {orphans.unreferencedAssets.length} · {uiText('settings.orphanMissing')}: {orphans.entriesWithMissingAssets.length}
            </p>
            {orphans.unreferencedAssets.length > 0 && (
              <>
                <ul>
                  {orphans.unreferencedAssets.map(id => (
                    <li key={id}>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => void cleanupOrphans()}>
                  {uiText('settings.orphanCleanup')}
                </button>
              </>
            )}
            {orphans.entriesWithMissingAssets.length > 0 && (
              <ul>
                {orphans.entriesWithMissingAssets.map(item => (
                  <li key={item.id}>
                    <code>{item.id}</code>: <code>{item.assetId}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
