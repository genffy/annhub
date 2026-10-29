/**
 * The settings view inside the application page (extension.md §2.5):
 * preferences (block entry + disabled sites, screenshot anonymize
 * default and what it covers), shortcuts display, data (export entry lives in the nav, here
 * storage usage and the orphan report), and the local-metrics readout —
 * aggregate numbers only, nothing readable. The screenshot output section
 * (formats, watermark, ratio presets, beautify) rides the same settings
 * object; see screenshot.ts for its shape.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { ExtensionSettings, SettingsPatch } from '../../background-service/settings-schema'
import { EntryStore, type OrphanReport } from '../../learning-core/store'
import type { CaptureTimingSummary, HabitSummary, MetricsPanelData } from '../../learning-core/metrics'
import {
  BEAUTIFY_BACKGROUND_IDS,
  BEAUTIFY_RADII,
  PADDING_PX,
  RATIO_PRESETS,
  decodeWatermarkImage,
  paintWatermark,
  type BeautifyBackground,
  type BeautifyPadding,
  type WatermarkImage,
} from '../content/screenshot/output'
import { formatBytes } from '../../utils/format-bytes'
import { uiText, type UiTextKey } from '../../utils/ui-text'
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../learning-core/types'
import { ANN_ANNOTATE_COMMAND, ANN_BLOCK_MODE_COMMAND, ANN_SCREENSHOT_COMMAND } from '../../constants'

/** The browser commands the shortcut hint speaks of; the browser also lists the toolbar button's own command. */
const SHORTCUT_COMMANDS: readonly string[] = [ANN_SCREENSHOT_COMMAND, ANN_BLOCK_MODE_COMMAND, ANN_ANNOTATE_COMMAND]

function shortcutLabel(command: string): UiTextKey {
  if (command === ANN_SCREENSHOT_COMMAND) return 'settings.shortcut.screenshot'
  if (command === ANN_ANNOTATE_COMMAND) return 'settings.shortcut.annotate'
  return 'settings.shortcut.block'
}

/** The 录制 section (extension.md §2.5): microphone grant status and the request, per annotate.md §2.1 (D-43). */
function RecordingSection() {
  const [grant, setGrant] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown')
  const [requesting, setRequesting] = useState(false)
  // the tab that wanted the microphone when the popup routed here (annotate.md §2.1)
  const [recordTabId, setRecordTabId] = useState<number | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tabId = Number(params.get('recordTab'))
    if (Number.isInteger(tabId) && tabId > 0) setRecordTabId(tabId)
    void navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then(status => setGrant(status.state as 'granted' | 'denied' | 'prompt'))
      .catch(() => setGrant('unknown'))
  }, [])

  const request = async () => {
    setRequesting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      setGrant('granted')
    } catch {
      // the browser never asks again once denied (market.md §4.7): say how to come back
      setGrant('denied')
    } finally {
      setRequesting(false)
    }
  }

  return (
    <section data-testid="recording-section">
      <h2>{uiText('settings.recording')}</h2>
      <p className="hint">{uiText('settings.recordingMicHint')}</p>
      <p className="keys" data-testid="mic-status">
        <span>{uiText('settings.recordingMicStatus')}</span>
        <span className={grant === 'denied' ? 'keys-unassigned' : ''}>{uiText(`settings.recordingMic.${grant}`)}</span>
      </p>
      {grant !== 'granted' && (
        <button type="button" onClick={() => void request()} disabled={requesting} data-testid="mic-request">
          {uiText('settings.recordingMicRequest')}
        </button>
      )}
      {grant === 'denied' && <p className="hint">{uiText('settings.recordingMicDenied')}</p>}
      {grant === 'granted' && recordTabId !== null && (
        <button type="button" onClick={() => void chrome.tabs.update(recordTabId, { active: true }).then(() => window.close())} data-testid="mic-back-to-tab">
          {uiText('settings.recordingBackToTab')}
        </button>
      )}
    </section>
  )
}

function ScreenshotSection({ settings, patch }: { settings: ExtensionSettings; patch(next: SettingsPatch): Promise<boolean> }) {
  const imageInputId = useId()
  const [watermarkText, setWatermarkText] = useState(settings.watermark.text)
  const [quality, setQuality] = useState(settings.downloadQuality)
  const [opacity, setOpacity] = useState(settings.watermark.opacity)
  const [error, setError] = useState('')
  const [imageBroken, setImageBroken] = useState(false)
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

  // The preview is the watermark exactly as copy/download paints it (screenshot.md §4.3): picture first, text after,
  // at the chosen corner, size and opacity. A picture the browser cannot read falls back to text alone and says so —
  // the same degradation the output takes, plus the re-upload hint (screenshot.md §5).
  const watermarkPreviewRef = (node: HTMLCanvasElement | null) => {
    if (!node) return
    const ctx = node.getContext('2d')
    if (!ctx) return
    const paint = (image: WatermarkImage | null): void => {
      ctx.clearRect(0, 0, node.width, node.height)
      ctx.fillStyle = '#e8ebef'
      ctx.fillRect(0, 0, node.width, node.height)
      paintWatermark(
        ctx,
        node,
        { enabled: settings.watermark.enabled, position: settings.watermark.position, size: settings.watermark.size, opacity, text: watermarkText || 'AnnHub' },
        false,
        image,
      )
    }
    if (settings.watermark.image) {
      void decodeWatermarkImage(settings.watermark.image, node.ownerDocument).then(image => {
        paint(image)
        setImageBroken(image === null)
      })
    } else {
      paint(null)
      setImageBroken(false)
    }
  }

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
              <option value="top-left">{uiText('settings.position.topLeft')}</option>
              <option value="top-right">{uiText('settings.position.topRight')}</option>
              <option value="bottom-left">{uiText('settings.position.bottomLeft')}</option>
              <option value="bottom-right">{uiText('settings.position.bottomRight')}</option>
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
        {imageBroken && (
          <p className="warn" role="alert">
            {uiText('settings.error.imageUnreadable')}
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
  const [panel, setPanel] = useState<MetricsPanelData | null>(null)
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
    const response = await MessageUtils.sendMessage<MetricsPanelData>({ type: 'GET_METRICS' })
    if (response.success) setPanel(response.data!)
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
        {/* a kind left unchecked is neither covered nor pre-filled as mosaic (screenshot.md §3) */}
        <div className="settings-group">
          <h3>{uiText('settings.anonymizeParts')}</h3>
          <div className="settings-inline">
            <label className="prop-preset">
              <input
                type="checkbox"
                checked={settings.anonymizeAvatars}
                onChange={event => void patch({ anonymizeAvatars: event.target.checked })}
                data-testid="anonymize-avatars"
              />
              {uiText('settings.anonymizeAvatars')}
            </label>
            <label className="prop-preset">
              <input type="checkbox" checked={settings.anonymizeNames} onChange={event => void patch({ anonymizeNames: event.target.checked })} data-testid="anonymize-names" />
              {uiText('settings.anonymizeNames')}
            </label>
          </div>
        </div>
      </section>

      <ScreenshotSection settings={settings} patch={patch} />

      <RecordingSection />

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
            <span>{uiText(shortcutLabel(command.name ?? ''))}</span>
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
        {panel && <MetricsPanel panel={panel} />}
      </section>
    </div>
  )
}

/**
 * The local-metrics readout (metrics.md §5, §10): M-03, M-11 and M-19–M-25,
 * every number an aggregate. Share-of-users metrics show this install's standing — the panel cannot see other
 * installs — next to the event counts that support it.
 */
function MetricsPanel({ panel }: { panel: MetricsPanelData }) {
  const summaries = panel.summaries

  const timingRow = (entrance: UiTextKey, timing: CaptureTimingSummary, guard: boolean) => (
    <tr key={entrance}>
      <th scope="row">
        {uiText('metrics.m03')} · {uiText(entrance)}
      </th>
      <td>
        {timing.count === 0 ? (
          uiText('metrics.m03.none')
        ) : (
          <>
            {uiText('metrics.m03.value', { count: timing.count, median: timing.median ?? '', p95: timing.p95 ?? '' })}
            {guard && <span className="hint"> · {uiText(timing.within300ms ? 'metrics.m03.guard.pass' : 'metrics.m03.guard.fail')}</span>}
          </>
        )}
      </td>
    </tr>
  )

  const habitRow = (label: UiTextKey, habit: HabitSummary, support: string) => (
    <tr key={label}>
      <th scope="row">{uiText(label)}</th>
      <td>{habit.satisfied === null ? uiText('metrics.none') : `${habit.satisfied ? uiText('metrics.yes') : uiText('metrics.no')} · ${support}`}</td>
    </tr>
  )

  const rateRow = (label: UiTextKey, rate: { rate: number | null }, support: string) => (
    <tr key={label}>
      <th scope="row">{uiText(label)}</th>
      <td>{rate.rate === null ? uiText('metrics.none') : uiText('metrics.rate', { pct: Math.round(rate.rate * 100), support })}</td>
    </tr>
  )

  const activation = summaries.activation
  return (
    <>
      <table className="props-table" data-testid="metrics-summary">
        <tbody>
          {timingRow('metrics.m03.selection', summaries.timing.selection, true)}
          {timingRow('metrics.m03.block', summaries.timing.block, true)}
          {timingRow('metrics.m03.screenshot', summaries.timing.screenshot, false)}
          <tr>
            <th scope="row">{uiText('metrics.m11')}</th>
            <td>
              {activation.firstSaveDay === null
                ? uiText('metrics.m11.noSaves')
                : `${activation.activated ? uiText('metrics.m11.activated') : uiText('metrics.m11.notYet')} · ${uiText('metrics.m11.firstSave', { day: activation.firstSaveDay })}`}
            </td>
          </tr>
          {habitRow('metrics.m20', summaries.propertyUse, uiText('metrics.m20.support', { n: summaries.propertyUse.numerator }))}
          {habitRow('metrics.m21', summaries.highlightUse, uiText('metrics.m21.support', { n: summaries.highlightUse.numerator, m: summaries.highlightUse.denominator }))}
          {habitRow(
            'metrics.m22',
            summaries.screenshotExternalUse,
            uiText('metrics.m22.support', { n: summaries.screenshotExternalUse.numerator, m: summaries.screenshotExternalUse.denominator }),
          )}
          {rateRow(
            'metrics.m23',
            summaries.blockFirstHit,
            uiText('metrics.m23.support', { a: summaries.blockFirstHit.unchangedLevels, u: summaries.blockFirstHit.undos, d: summaries.blockFirstHit.denominator }),
          )}
          {habitRow('metrics.m24', summaries.beautifyUse, uiText('metrics.m24.support', { n: summaries.beautifyUse.numerator, m: summaries.beautifyUse.denominator }))}
          {rateRow('metrics.m25', summaries.frameReuse, uiText('metrics.m25.support', { n: summaries.frameReuse.numerator, d: summaries.frameReuse.denominator }))}
          <tr>
            <th scope="row">{uiText('metrics.m31')}</th>
            <td data-testid="metrics-m31">
              {summaries.recordingUse.downloads === 0
                ? uiText('metrics.m31.none')
                : uiText('metrics.m31.value', {
                    n: summaries.recordingUse.downloads,
                    mic: summaries.recordingUse.withMic,
                    user: summaries.recordingUse.stoppedBy.user,
                    tab: summaries.recordingUse.stoppedBy.tab_closed,
                    limit: summaries.recordingUse.stoppedBy.limit,
                  })}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="settings-group">
        <h3>{uiText('metrics.m19')}</h3>
        <table className="props-table" data-testid="metrics-weeks">
          <thead>
            <tr>
              <th scope="col">{uiText('metrics.week')}</th>
              <th scope="col">{uiText('metrics.m19.reopens')}</th>
              <th scope="col">{uiText('metrics.m19.exports')}</th>
              <th scope="col">{uiText('metrics.m19.retrieved')}</th>
              <th scope="col">{uiText('metrics.queried')}</th>
              <th scope="col">{uiText('metrics.m19.sought')}</th>
            </tr>
          </thead>
          <tbody>
            {summaries.weeks.map(week => (
              <tr key={week.weekStart}>
                <td>{week.weekStart}</td>
                <td>{week.reopens}</td>
                <td>{week.exports}</td>
                <td>{week.retrieved}</td>
                <td>{week.queried}</td>
                <td>{week.soughtBack ? uiText('metrics.yes') : uiText('metrics.no')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="settings-group">
        <h3>{uiText('metrics.events')}</h3>
        <table className="props-table" data-testid="metrics-table">
          <tbody>
            {Object.entries(panel.events)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, bucket]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{bucket.total}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
