import MessageUtils from '../../../utils/message'
import { decodeWatermarkImage, type WatermarkImage } from '../../../utils/screenshot-output'
import { DEFAULT_BEAUTIFY, type BeautifySettings } from '../../../core/screenshot-options'
import type { ExtensionSettings } from '../../../core/settings'
import { ALL_IDENTITY_PARTS, type IdentityParts } from './detect'

/**
 * The session's copy of the preferences (RV-CAP-18, split out of the session): the settings
 * record, the anonymity toggles, the watermark switch and picture, and the beautify style —
 * loaded once before any capture, with the `A` and `W` toggles layered on top. Owns the fields;
 * the session answers through the port for what a change repaints.
 */
export interface SessionPreferencesPort {
  readonly doc: Document
  /** True once the session is gone; a late answer is dropped. */
  exited(): boolean
  /** The defaults are in: the hint rereads and the picking chips may appear. */
  loaded(): void
  /** The watermark picture arrived; a preview that is already up repaints with it. */
  watermarkImageLoaded(image: WatermarkImage | null): void
}

export class SessionPreferences {
  settings: ExtensionSettings | null = null
  anonymizeOn = true
  anonymizeParts: IdentityParts = ALL_IDENTITY_PARTS
  anonymizeToggled = false
  watermarkOn = true
  watermarkImage: WatermarkImage | null = null
  beautify: BeautifySettings = { ...DEFAULT_BEAUTIFY }

  constructor(private readonly port: SessionPreferencesPort) {}

  /** The anonymity parts the settings leave on. */
  anonymizeAvailable(): boolean {
    return this.anonymizeParts.avatar || this.anonymizeParts.name
  }

  /**
   * Reads the settings once, before any capture: no shot is taken before the defaults are in —
   * the block capsule's shot starts together with the session.
   */
  async load(): Promise<void> {
    const response = await MessageUtils.sendMessage({ type: 'GET_SETTINGS' })
    if (this.port.exited() || !response.success || !response.data) return
    this.settings = response.data
    this.anonymizeParts = { avatar: response.data.anonymizeAvatars, name: response.data.anonymizeNames }
    if (!this.anonymizeToggled) this.anonymizeOn = response.data.anonymizeDefault
    this.watermarkOn = response.data.watermark.enabled
    this.beautify = { ...response.data.beautify }
    if (response.data.watermark.enabled && response.data.watermark.image) void this.loadWatermarkImage(response.data.watermark.image)
    this.port.loaded()
  }

  /**
   * Decodes the watermark picture, once per session; a picture the browser cannot read stays
   * `null` and the text is written without it (screenshot.md §5). A preview that is already up
   * gets it as soon as it is ready.
   */
  async loadWatermarkImage(dataUrl: string): Promise<void> {
    const image = await decodeWatermarkImage(dataUrl, this.port.doc)
    if (this.port.exited()) return
    this.watermarkImage = image
    this.port.watermarkImageLoaded(image)
  }

  /** 复原: the beautify style goes back to what the settings give. */
  resetBeautify(): void {
    this.beautify = { ...(this.settings?.beautify ?? DEFAULT_BEAUTIFY) }
  }
}
