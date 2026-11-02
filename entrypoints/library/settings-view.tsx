/**
 * The settings view inside the application page (extension.md §2.5): two
 * columns of cards — preferences, screenshot output, brand watermark and
 * beautify on the left; recording, shortcuts, data and the local-metrics
 * readout on the right. Every control is a native input dressed by CSS: the
 * switches are checkboxes wearing `role="switch"` named for their feature,
 * the segmented controls and swatches are radios, the sliders are ranges that
 * commit on release. The metrics panel answers aggregate numbers only
 * (metrics.md §5).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { ExtensionSettings, SettingsPatch } from '../../background-service/settings-schema'
import { EntryStore, type OrphanReport } from '../../learning-core/store'
import type { MetricsPanelData } from '../../learning-core/metrics'
import {
  BEAUTIFY_BACKGROUND_IDS,
  BEAUTIFY_RADII,
  PADDING_PX,
  RATIO_PRESETS,
  backgroundCss,
  decodeWatermarkImage,
  paintWatermark,
  type BeautifyBackground,
  type BeautifyPadding,
  type WatermarkImage,
} from '../content/screenshot/output'
import { formatBytes } from '../../utils/format-bytes'
import { uiText, type UiTextKey } from '../../utils/ui-text'
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../learning-core/types'
import { ANN_ANNOTATE_COMMAND, ANN_BLOCK_MODE_COMMAND, ANN_RECORD_COMMAND, ANN_SCREENSHOT_COMMAND } from '../../constants'
import { ANNOTATION_COLORS } from '../content/screenshot/editor'
import { ExternalLink } from 'lucide-react'
import { MetricsCard } from './settings-metrics-card'
import { SettingsCard, SettingsRow } from './settings-card'
import { SettingsSwitch } from './settings-switch'
import { SettingsSegmentedControl } from './settings-seg'
import { SettingsSlider } from './settings-slider'
import { SettingsCornerPicker } from './settings-posbox'
import { SettingsCheckChip } from './settings-check-chip'
import { SettingsSwatches } from './settings-swatches'

/** The browser commands the shortcut hint speaks of; the browser also lists the toolbar button's own command. */
const SHORTCUT_COMMANDS: readonly string[] = [ANN_SCREENSHOT_COMMAND, ANN_BLOCK_MODE_COMMAND, ANN_ANNOTATE_COMMAND, ANN_RECORD_COMMAND]

function shortcutLabel(command: string): UiTextKey {
  if (command === ANN_SCREENSHOT_COMMAND) return 'settings.shortcut.screenshot'
  if (command === ANN_ANNOTATE_COMMAND) return 'settings.shortcut.annotate'
  if (command === ANN_RECORD_COMMAND) return 'settings.shortcut.record'
  return 'settings.shortcut.block'
}

/** One shortcut string as keycaps: split at "+" when it has one ("Ctrl+Shift+S"), else per character ("⇧⌘S"). */
function keyCaps(shortcut: string): string[] {
  if (shortcut.includes('+')) return shortcut.split('+').filter(Boolean)
  return [...shortcut]
}

/** One metric as a row: the M-id in its tag, the name on the left, the value (and its support) on the right. */
/** The 录制 card (extension.md §2.5): microphone grant status and the request, per annotate.md §2.1, plus the cursor highlight. */
function RecordingCard({ settings, patch }: { settings: ExtensionSettings; patch(next: SettingsPatch): Promise<boolean> }) {
  const [grant, setGrant] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown')
  const [requesting, setRequesting] = useState(false)
  // the tab that wanted the microphone when the popup routed here (annotate.md §2.1)
  const [recordTabId, setRecordTabId] = useState<number | null>(null)
  const cursor = settings.recording.cursorHighlight

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
    <SettingsCard title={uiText('settings.recording')} testId="recording-section">
      <SettingsRow name={uiText('settings.microphone')} desc={uiText('settings.recordingMicHint')}>
        {() => (
          <span className="rec-mic">
            <span className={`mic-status${grant === 'denied' ? ' is-denied' : ''}`} data-testid="mic-status">
              {uiText(`settings.recordingMic.${grant}`)}
            </span>
            {grant !== 'granted' && (
              <button type="button" className="ghost sm" onClick={() => void request()} disabled={requesting} data-testid="mic-request">
                {uiText('settings.recordingMicRequest')}
              </button>
            )}
            {grant === 'granted' && recordTabId !== null && (
              <button
                type="button"
                className="ghost sm"
                onClick={() => void chrome.tabs.update(recordTabId, { active: true }).then(() => window.close())}
                data-testid="mic-back-to-tab"
              >
                {uiText('settings.recordingBackToTab')}
              </button>
            )}
          </span>
        )}
      </SettingsRow>
      {grant === 'denied' && (
        <div className="set-pad">
          <p className="banner banner-warn">{uiText('settings.recordingMicDenied')}</p>
        </div>
      )}
      <SettingsRow name={uiText('settings.cursorHighlightToggle')} desc={uiText('settings.cursorHighlightHint')}>
        {ids => (
          <SettingsSwitch
            checked={cursor.enabled}
            onChange={enabled => void patch({ recording: { cursorHighlight: { enabled } } })}
            nameId={ids.nameId}
            describedBy={ids.descId}
            testId="cursor-highlight-toggle"
          />
        )}
      </SettingsRow>
      {cursor.enabled && (
        <div className="set-sub">
          <div className="set-fr">
            <span className="set-lb">{uiText('settings.cursorHighlightShape')}</span>
            <SettingsSegmentedControl
              ariaLabel={uiText('settings.cursorHighlightShape')}
              value={cursor.shape}
              options={(['ring', 'rounded', 'diamond'] as const).map(shape => ({ value: shape, label: uiText(`settings.cursorHighlight.shape.${shape}` as UiTextKey) }))}
              onChange={shape => void patch({ recording: { cursorHighlight: { shape } } })}
            />
          </div>
          <div className="set-fr">
            <span className="set-lb">{uiText('shot.colors')}</span>
            <span className="hl-colors" role="group" aria-label={uiText('shot.colors')}>
              {ANNOTATION_COLORS.map(entry => (
                <button
                  key={entry.value}
                  type="button"
                  className={`hl-dot${cursor.color === entry.value ? ' hl-dot-active' : ''}`}
                  style={{ background: entry.value }}
                  aria-label={uiText(`shot.color.${entry.name}` as UiTextKey)}
                  aria-pressed={cursor.color === entry.value}
                  onClick={() => void patch({ recording: { cursorHighlight: { color: entry.value } } })}
                />
              ))}
            </span>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}

function ScreenshotCard({ settings, patch }: { settings: ExtensionSettings; patch(next: SettingsPatch): Promise<boolean> }) {
  return (
    <SettingsCard title={uiText('settings.screenshot')}>
      <SettingsRow name={uiText('settings.anonymize')} desc={uiText('settings.anonymizeHint')}>
        {ids => (
          <SettingsSwitch
            checked={settings.anonymizeDefault}
            onChange={checked => void patch({ anonymizeDefault: checked })}
            nameId={ids.nameId}
            describedBy={ids.descId}
            testId="anonymize-toggle"
          />
        )}
      </SettingsRow>
      {/* a kind left unchecked is neither covered nor pre-filled as mosaic (screenshot.md §3) */}
      <SettingsRow name={uiText('settings.anonymizeParts')}>
        {() => (
          <span className="chip-row">
            <SettingsCheckChip
              checked={settings.anonymizeAvatars}
              onChange={checked => void patch({ anonymizeAvatars: checked })}
              label={uiText('settings.anonymizeAvatars')}
              testId="anonymize-avatars"
            />
            <SettingsCheckChip
              checked={settings.anonymizeNames}
              onChange={checked => void patch({ anonymizeNames: checked })}
              label={uiText('settings.anonymizeNames')}
              testId="anonymize-names"
            />
          </span>
        )}
      </SettingsRow>
      <SettingsRow name={uiText('settings.downloadFormat')} desc={uiText('settings.downloadFormatHint')}>
        {() => (
          <SettingsSegmentedControl
            ariaLabel={uiText('settings.downloadFormat')}
            value={settings.downloadFormat}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpeg', label: 'JPEG' },
              { value: 'webp', label: 'WebP' },
            ]}
            onChange={format => void patch({ downloadFormat: format })}
          />
        )}
      </SettingsRow>
      <QualityRow settings={settings} patch={patch} />
      <div className="set-r set-r-block">
        <div className="set-l">
          <b>{uiText('settings.ratioPresets')}</b>
        </div>
        <div className="chip-row chip-row-wrap">
          {RATIO_PRESETS.map(preset => (
            <SettingsCheckChip
              key={preset.id}
              checked={settings.ratioPresets.includes(preset.id)}
              onChange={checked => {
                const next = checked ? [...settings.ratioPresets, preset.id] : settings.ratioPresets.filter(id => id !== preset.id)
                void patch({ ratioPresets: next })
              }}
              label={preset.id}
              ratio={{ w: preset.w, h: preset.h }}
            />
          ))}
        </div>
      </div>
    </SettingsCard>
  )
}

/** The quality slider stays in place for PNG, dimmed and inert — PNG has no quality (the design's "off" state). */
function QualityRow({ settings, patch }: { settings: ExtensionSettings; patch(next: SettingsPatch): Promise<boolean> }) {
  const [error, setError] = useState('')
  const nameId = useId()
  return (
    <div className="set-r">
      <div className="set-l" id={nameId}>
        <b>{uiText('settings.quality')}</b>
      </div>
      <div className="set-ctl">
        <SettingsSlider
          value={settings.downloadQuality}
          min={0.5}
          max={1}
          step={0.05}
          nameId={nameId}
          disabled={settings.downloadFormat === 'png'}
          format={value => value.toFixed(2)}
          onCommit={value => void patch({ downloadQuality: value }).then(ok => (!ok ? setError(uiText('toast.saveFailed')) : setError('')))}
        />
        {error && (
          <span className="sl-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}

function WatermarkCard({ settings, patch }: { settings: ExtensionSettings; patch(next: SettingsPatch): Promise<boolean> }) {
  const imageInput = useRef<HTMLInputElement>(null)
  const [watermarkText, setWatermarkText] = useState(settings.watermark.text)
  const [opacity, setOpacity] = useState(settings.watermark.opacity)
  const [error, setError] = useState('')
  const [imageBroken, setImageBroken] = useState(false)
  const watermarkDirty = useRef(false)

  useEffect(() => {
    if (!watermarkDirty.current) setWatermarkText(settings.watermark.text)
    setOpacity(settings.watermark.opacity)
  }, [settings.watermark.opacity, settings.watermark.text])

  const saveText = async () => {
    if (!watermarkDirty.current) return
    const ok = await patch({ watermark: { text: watermarkText } })
    if (ok) {
      watermarkDirty.current = false
      setError('')
    } else setError(uiText('toast.saveFailed'))
  }
  const saveOpacity = async (value: number) => {
    if (await patch({ watermark: { opacity: value } })) setError('')
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

  const opacityId = useId()
  return (
    <SettingsCard title={uiText('settings.watermark')}>
      <SettingsRow name={uiText('settings.watermarkToggle')}>
        {ids => (
          <SettingsSwitch
            checked={settings.watermark.enabled}
            onChange={enabled => void patch({ watermark: { ...settings.watermark, enabled } })}
            nameId={ids.nameId}
            testId="watermark-toggle"
          />
        )}
      </SettingsRow>
      <div className="set-sub">
        <div className="set-fr">
          <span className="set-lb set-lb-wide">{uiText('settings.watermarkText')}</span>
          <input
            className="wm-text"
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
          <span className="wm-count" aria-hidden="true">
            {watermarkText.length} / 40
          </span>
        </div>
        {/* the chooser is a hidden input behind its own buttons: the thumbnail names what is there, not a file name */}
        <div className="set-fr">
          <span className="set-lb set-lb-wide">{uiText('settings.watermarkImage')}</span>
          {settings.watermark.image && <img className="wm-thumb" src={settings.watermark.image} alt="" />}
          <button type="button" className="ghost sm" onClick={() => imageInput.current?.click()}>
            {settings.watermark.image ? uiText('settings.changeImage') : uiText('settings.chooseImage')}
          </button>
          {settings.watermark.image && (
            <button type="button" className="ghost sm" onClick={() => void patch({ watermark: { image: null } })}>
              {uiText('settings.remove')}
            </button>
          )}
          <input
            ref={imageInput}
            type="file"
            accept="image/png"
            className="vh-input"
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
        </div>
        <div className="set-fr">
          <span className="set-lb" />
          <p className="set-note">{uiText('settings.watermarkImageHint')}</p>
        </div>
        <div className="set-fr">
          <span className="set-lb">{uiText('settings.position')}</span>
          <SettingsCornerPicker
            ariaLabel={uiText('settings.position')}
            value={settings.watermark.position}
            corners={(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((value, index) => ({
              value,
              label: uiText(
                ['settings.position.topLeft', 'settings.position.topRight', 'settings.position.bottomLeft', 'settings.position.bottomRight'][index]! as 'settings.position.topLeft',
              ),
              corner: (['tl', 'tr', 'bl', 'br'] as const)[index],
            }))}
            onChange={position => void patch({ watermark: { ...settings.watermark, position } })}
          />
        </div>
        <div className="set-fr">
          <span className="set-lb">{uiText('settings.size')}</span>
          <SettingsSegmentedControl
            ariaLabel={uiText('settings.size')}
            value={settings.watermark.size}
            options={(['small', 'medium', 'large'] as const).map(size => ({ value: size, label: uiText(`settings.size.${size}`) }))}
            onChange={size => void patch({ watermark: { ...settings.watermark, size } })}
          />
        </div>
        <div className="set-fr">
          <span className="set-lb" id={opacityId}>
            {uiText('settings.opacity')}
          </span>
          <SettingsSlider
            value={settings.watermark.opacity}
            min={0.2}
            max={1}
            step={0.05}
            nameId={opacityId}
            format={value => `${Math.round(value * 100)}%`}
            onCommit={value => void saveOpacity(value)}
          />
        </div>
        <div className="set-fr set-fr-top">
          <span className="set-lb">{uiText('settings.preview')}</span>
          <canvas
            ref={watermarkPreviewRef}
            width={220}
            height={92}
            className="watermark-preview"
            role="img"
            aria-label={uiText('settings.preview')}
            data-testid="watermark-preview"
          />
        </div>
        {error && (
          <div className="set-fr">
            <span className="set-lb" />
            <p className="banner banner-danger" role="alert">
              {error}
            </p>
          </div>
        )}
        {imageBroken && (
          <div className="set-fr">
            <span className="set-lb" />
            <p className="banner banner-warn" role="alert">
              {uiText('settings.error.imageUnreadable')}
            </p>
          </div>
        )}
      </div>
    </SettingsCard>
  )
}

function BeautifyCard({ settings, patch }: { settings: ExtensionSettings; patch(next: SettingsPatch): Promise<boolean> }) {
  const shadowId = useId()
  const beautify = settings.beautify
  return (
    <SettingsCard title={uiText('settings.beautify')}>
      <SettingsRow name={uiText('settings.beautifyToggle')}>
        {ids => <SettingsSwitch checked={beautify.enabled} onChange={enabled => void patch({ beautify: { ...beautify, enabled } })} nameId={ids.nameId} />}
      </SettingsRow>
      <div className="set-sub">
        <div className="set-fr">
          <span className="set-lb">{uiText('settings.background')}</span>
          <SettingsSwatches
            ariaLabel={uiText('settings.background')}
            value={beautify.background}
            swatches={BEAUTIFY_BACKGROUND_IDS.map(id => ({ value: id, label: uiText(`shot.beautify.background.${id}`), css: id === 'none' ? '' : backgroundCss(id) }))}
            onChange={background => void patch({ beautify: { ...beautify, background: background as BeautifyBackground } })}
          />
        </div>
        <div className="set-fr">
          <span className="set-lb">{uiText('settings.padding')}</span>
          <SettingsSegmentedControl
            ariaLabel={uiText('settings.padding')}
            value={beautify.padding}
            options={(Object.keys(PADDING_PX) as BeautifyPadding[]).map(size => ({ value: size, label: uiText(`settings.size.${size}`) }))}
            onChange={padding => void patch({ beautify: { ...beautify, padding } })}
          />
        </div>
        <div className="set-fr">
          <span className="set-lb">{uiText('settings.radius')}</span>
          <SettingsSegmentedControl
            ariaLabel={uiText('settings.radius')}
            value={String(beautify.radius)}
            options={BEAUTIFY_RADII.map(radius => ({ value: String(radius), label: String(radius) }))}
            onChange={radius => void patch({ beautify: { ...beautify, radius: Number(radius) } })}
          />
        </div>
        <div className="set-fr">
          <span className="set-lb" id={shadowId}>
            {uiText('settings.shadow')}
          </span>
          <SettingsSwitch checked={beautify.shadow} onChange={shadow => void patch({ beautify: { ...beautify, shadow } })} nameId={shadowId} />
        </div>
        {/* a CSS placeholder, not the real picture: the chosen background, padding, corner and shadow as a grey card */}
        <div className="set-fr set-fr-top">
          <span className="set-lb">{uiText('settings.preview')}</span>
          <div
            className={`bz-preview${beautify.background === 'none' ? ' bz-preview-none' : ''}`}
            style={{
              padding: Math.round(PADDING_PX[beautify.padding] / 4),
              ...(beautify.background === 'none' ? {} : { background: backgroundCss(beautify.background) }),
            }}
          >
            <div
              className="bz-preview-card"
              style={{
                borderRadius: beautify.radius,
                boxShadow: beautify.shadow ? '0 14px 26px -10px rgb(0 0 0 / 0.5)' : 'none',
              }}
            />
          </div>
        </div>
      </div>
    </SettingsCard>
  )
}

function ShortcutsCard({ shortcuts }: { shortcuts: chrome.commands.Command[] }) {
  return (
    <SettingsCard title={uiText('settings.shortcuts')}>
      {shortcuts.map(command => (
        <div className="set-r" key={command.name}>
          <div className="set-l">
            <b>{uiText(shortcutLabel(command.name ?? ''))}</b>
          </div>
          <div className="set-ctl">
            {command.shortcut ? (
              <span className="keys-group">
                {keyCaps(command.shortcut).map((cap, index) => (
                  <kbd key={`${cap}-${index}`}>{cap}</kbd>
                ))}
              </span>
            ) : (
              <span className="keys-unassigned">{uiText('settings.shortcut.unassigned')}</span>
            )}
          </div>
        </div>
      ))}
      <div className="set-r">
        <div className="set-l">
          <b>{uiText('settings.shortcutsManageRow')}</b>
          <small>{uiText('settings.shortcutsHint')}</small>
        </div>
        <div className="set-ctl">
          <button
            type="button"
            className="ghost sm"
            aria-label={uiText('settings.shortcut.manage')}
            onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            <ExternalLink size={13} aria-hidden /> {uiText('settings.shortcut.open')}
          </button>
        </div>
      </div>
    </SettingsCard>
  )
}

function DataCard({
  usage,
  orphans,
  loadOrphans,
  cleanupOrphans,
}: {
  usage: { usage: number; quota: number } | null
  orphans: OrphanReport | null
  loadOrphans(): void
  cleanupOrphans(): void
}) {
  return (
    <SettingsCard title={uiText('settings.data')}>
      <div className="set-r set-r-block">
        <div className="set-l">
          <b>{uiText('settings.storageLocal')}</b>
        </div>
        <span className="set-ctl tnum">{usage ? `${formatBytes(usage.usage)} / ${formatBytes(usage.quota)}` : ''}</span>
        {usage && usage.quota > 0 && <progress className="storage-bar" value={usage.usage} max={usage.quota} />}
      </div>
      <SettingsRow name={uiText('settings.orphans')}>
        {() => (
          <button type="button" className="ghost sm" onClick={loadOrphans}>
            {uiText('settings.orphanReport')}
          </button>
        )}
      </SettingsRow>
      {orphans && (
        <div className="set-pad set-note" data-testid="orphan-report">
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
              <button type="button" className="ghost sm" onClick={cleanupOrphans}>
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
    </SettingsCard>
  )
}

/**
 * The local-metrics readout (metrics.md §5, §10): M-03, M-11 and M-19–M-25,
 * every number an aggregate. Share-of-users metrics show this install's standing — the panel cannot see other
 * installs — next to the event counts that support it.
 */
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

  const loadOrphans = useCallback(() => {
    void MessageUtils.sendMessage<OrphanReport>({ type: 'ORPHAN_REPORT' }).then(response => {
      if (response.success) setOrphans(response.data!)
    })
  }, [])

  const cleanupOrphans = useCallback(async () => {
    const ids = orphans?.unreferencedAssets ?? []
    if (ids.length === 0 || !window.confirm(uiText('settings.orphanConfirm', { count: ids.length }))) return
    const store = new EntryStore('annhub')
    try {
      await store.initialize()
      await store.deleteOrphanAssets(ids)
      loadOrphans()
    } finally {
      await store.close()
    }
  }, [orphans, loadOrphans])

  const loadMetrics = useCallback(() => {
    void MessageUtils.sendMessage<MetricsPanelData>({ type: 'GET_METRICS' }).then(response => {
      if (response.success) setPanel(response.data!)
    })
  }, [])

  if (!settings) {
    return <div className="settings-view">{uiText('common.loading')}</div>
  }

  return (
    <div className="settings-view" data-testid="settings-view">
      <header className="page-head">
        <div className="page-titles">
          <h1 className="page-title">{uiText('settings.title')}</h1>
          <p className="page-sub">{uiText('settings.subtitle')}</p>
        </div>
      </header>
      <div className="page-body">
        <div className="settings-cards">
          <div className="settings-col">
            <section className="set">
              <div className="set-h">
                <h2>{uiText('settings.preferences')}</h2>
              </div>
              <SettingsRow name={uiText('settings.defaultHighlightColor')}>
                {() => (
                  <span className="hl-colors" role="group" aria-label={uiText('settings.defaultHighlightColor')}>
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
                  </span>
                )}
              </SettingsRow>
              <SettingsRow name={uiText('settings.blockEntry')} desc={uiText('settings.blockEntryHint')}>
                {ids => (
                  <SettingsSwitch
                    checked={settings.blockEntryEnabled}
                    onChange={checked => void patch({ blockEntryEnabled: checked })}
                    nameId={ids.nameId}
                    describedBy={ids.descId}
                    testId="block-entry-toggle"
                  />
                )}
              </SettingsRow>
              <div className="set-r set-r-block">
                <div className="set-l">
                  <b>{uiText('settings.disabledSites')}</b>
                </div>
                <span className="tag">{uiText('settings.count', { count: settings.blockDisabledSites.length })}</span>
                {settings.blockDisabledSites.length > 0 && (
                  <ul className="sites">
                    {settings.blockDisabledSites.map(site => (
                      <li key={site}>
                        <span className="site-name">{site}</span>
                        <button type="button" className="ghost sm" onClick={() => void patch({ blockDisabledSites: settings.blockDisabledSites.filter(item => item !== site) })}>
                          {uiText('settings.remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
            <ScreenshotCard settings={settings} patch={patch} />
            <WatermarkCard settings={settings} patch={patch} />
            <BeautifyCard settings={settings} patch={patch} />
          </div>
          <div className="settings-col">
            <RecordingCard settings={settings} patch={patch} />
            <ShortcutsCard shortcuts={shortcuts} />
            <DataCard usage={usage} orphans={orphans} loadOrphans={loadOrphans} cleanupOrphans={() => void cleanupOrphans()} />
            <MetricsCard panel={panel} loadMetrics={loadMetrics} />
          </div>
        </div>
      </div>
    </div>
  )
}
