/**
 * The block-clip hover entry (docs/product/capture.md §6.2): the pointer
 * rests on a start — the innermost block under it, a heading's section, or
 * the block big enough beyond a small one — and the outline, its label and
 * the capsule appear. The capsule clips, screenshots and downloads the
 * outlined layer; 外一层 and 里一层 climb the target chain, a hover on them
 * previews the next layer with a dashed outline, and the capsule never covers
 * the page's own controls. The keyboard block mode lives in block-mode.ts and
 * reads the same chain.
 */
import { isUserInput } from './user-input'
import { overlayIcon } from './icons'
import { uiText } from '../../utils/ui-text'
import { positionCapsule } from './capsule-place'
import { candidateRect, type BlockCandidate } from './blocks'
import { chainAtPoint, isSuppressed, layerKindName, layerLabel, sameLayer, startIndexOf } from './target-chain'
import { BlockMode } from './block-mode'

const ROOT_ATTR = 'data-ann-ui'
/** Four still samples of 100ms each: the pointer rests ~400ms before the capsule appears. */
const DWELL_TICKS = 4
const TICK_MS = 100
/** Less than this much movement per 100ms counts as still; hand jitter and trackpad drift do not restart the timer. */
const STILL_PX = 6
const LEAVE_MS = 150
/** A repeat clip for the same block inside this window is a replay of one gesture, not a second save (issue #105). */
const CLIP_REPEAT_MS = 1500
/** A block this narrow cannot carry the full label beside the capsule: the label is the kind alone. */
const NARROW_LABEL_PX = 260

export interface BlockHoverHooks {
  onClip(candidate: BlockCandidate, levelChanged: boolean): void
  /** Absent in a child frame: the screenshot session belongs to the top frame's viewport. */
  onScreenshot?(candidate: BlockCandidate): void
  /** Also top frame only (download.md §2.1): the run needs the page's own media manifest. */
  onDownload?(candidate: BlockCandidate): void
  onDisableSite(): void
  onDisableEntry(): void
  openSettings(): void
}

export interface SettingsGate {
  enabled(): Promise<boolean>
  siteDisabled(host: string): Promise<boolean>
}

/** Paints an outline and its label for a layer; the keyboard mode reuses it with its own colour. */
export function paintOutline(doc: Document, layer: BlockCandidate, keyboard: boolean): { outline: HTMLElement; label: HTMLElement } {
  const rect = candidateRect(layer)
  const outline = doc.createElement('div')
  outline.setAttribute(ROOT_ATTR, 'block-outline')
  outline.className = keyboard ? 'ann-block-outline ann-block-outline-keyboard' : 'ann-block-outline'
  Object.assign(outline.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' })
  const label = doc.createElement('div')
  label.setAttribute(ROOT_ATTR, 'block-label')
  label.className = keyboard ? 'ann-block-label ann-block-label-keyboard' : 'ann-block-label'
  doc.documentElement.appendChild(outline)
  doc.documentElement.appendChild(label)
  return { outline, label }
}

/** Places the label on the outline's top edge; a tall block pins it to the visible top, a narrow block keeps the kind alone. */
export function placeLabel(doc: Document, label: HTMLElement, layer: BlockCandidate, capsuleLeft: number | null): void {
  const rect = candidateRect(layer)
  const view = doc.defaultView!
  // a zero box has no layout to measure (jsdom): the full label stays
  const narrow = rect.width > 0 && rect.width < NARROW_LABEL_PX
  label.textContent = narrow ? layerKindName(layer) : layerLabel(layer, 'content')
  const height = label.offsetHeight || 24
  const width = label.offsetWidth || 80
  let left = rect.left + 4
  if (capsuleLeft !== null && capsuleLeft < rect.left + 80) left = rect.right - width - 4
  left = Math.max(8, Math.min(view.innerWidth - width - 8, left))
  const top = rect.top >= 4 ? rect.top - height - 4 : 4
  Object.assign(label.style, { left: left + 'px', top: top + 'px' })
}

class HoverEntry {
  private chain: BlockCandidate[] = []
  private targetIndex = 0
  private levelChanged = false
  private paused: BlockCandidate | null = null
  private outlineEl: HTMLElement | null = null
  private labelEl: HTMLElement | null = null
  private capsuleEl: HTMLElement | null = null
  private previewEl: HTMLElement | null = null
  private previewTipEl: HTMLElement | null = null
  private tickTimer: number | null = null
  private stillTicks = 0
  private samplePoint = { x: 0, y: 0 }
  private leaveTimer: number | null = null
  private lastPoint = { x: 0, y: 0 }
  /** The buttons of the last pointer event: a dwell that expires under a held primary button reveals nothing (RV-CAP-15). */
  private lastPointerButtons = 0
  private revealGeneration = 0
  private listeners: (() => void)[] = []

  constructor(
    private readonly doc: Document,
    private readonly hooks: BlockHoverHooks,
    private readonly gate: SettingsGate,
    private readonly isModeActive: () => boolean,
  ) {}

  install(): void {
    const onPointerMove = (event: PointerEvent): void => {
      if (!isUserInput(event)) return
      if (this.isModeActive()) return
      if (this.screenshotConfirming()) {
        this.hideNow()
        return
      }
      this.lastPoint = { x: event.clientX, y: event.clientY }
      this.lastPointerButtons = event.buttons
      if (this.insideOwnUi(event)) {
        // the pointer is on the capsule itself: keep it alive so the click lands
        this.clearLeave()
        return
      }
      const selection = this.doc.getSelection()
      if (selection && !selection.isCollapsed) {
        this.scheduleLeave()
        return
      }
      const active = this.doc.activeElement as HTMLElement | null
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        this.scheduleLeave()
        return
      }
      // Leaving the outlined block hides it; a rest on whatever is under the
      // pointer can still reveal the next start (capture.md §6.2).
      if (this.pointerOutsideHover(event.clientX, event.clientY)) {
        this.armLeave()
      } else {
        this.clearLeave()
      }
      this.ensureTick()
    }
    const onButtonsChange = (event: PointerEvent): void => {
      if (!isUserInput(event)) return
      this.lastPointerButtons = event.buttons
    }
    const onLeaveWindow = (): void => {
      this.stopTick()
      this.scheduleLeave()
    }
    // A visible capsule/outline is anchored to scrolled-away positions: hide
    // it. A resting pointer stays eligible after the page settles — the
    // stillness clock restarts and the next reveal hit-tests the page afresh.
    const onScroll = (): void => {
      if (this.screenshotConfirming()) {
        this.hideNow()
        return
      }
      this.hideNow()
      this.ensureTick()
    }
    const onDragSelect = (event: PointerEvent): void => {
      if (!isUserInput(event)) return
      this.lastPointerButtons = event.buttons
      if (this.screenshotConfirming()) {
        this.hideNow()
        return
      }
      // pressing our own capsule is operating the entry, not starting a drag
      if (this.insideOwnUi(event)) return
      if (event.buttons === 1) this.hideNow()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isUserInput(event) || this.isModeActive()) return
      // Any key dismisses the hover outline. Escape still does when Parent
      // left focus on the capsule button — that click is our own UI, and
      // ignoring Escape there is what stuck the timeline outline (issue #107).
      if (event.key !== 'Escape' && this.insideOwnUi(event)) return
      // the block under the pointer pauses: it stays quiet until the pointer
      // rests on another start (capture.md §6.2 暂停)
      if (this.capsuleEl || this.outlineEl) this.pauseHereNow()
      this.hideNow()
    }

    this.doc.addEventListener('pointermove', onPointerMove, true)
    this.doc.addEventListener('pointerleave', onLeaveWindow, true)
    this.doc.addEventListener('scroll', onScroll, true)
    this.doc.addEventListener('pointerdown', onDragSelect, true)
    // the primary button can come and go without a move: the dwell's re-check reads a live answer (RV-CAP-15)
    this.doc.addEventListener('pointerup', onButtonsChange, true)
    this.doc.addEventListener('keydown', onKeyDown, true)
    this.listeners = [
      () => this.doc.removeEventListener('pointermove', onPointerMove, true),
      () => this.doc.removeEventListener('pointerleave', onLeaveWindow, true),
      () => this.doc.removeEventListener('scroll', onScroll, true),
      () => this.doc.removeEventListener('pointerdown', onDragSelect, true),
      () => this.doc.removeEventListener('pointerup', onButtonsChange, true),
      () => this.doc.removeEventListener('keydown', onKeyDown, true),
    ]
  }

  dispose(): void {
    this.listeners.forEach(fn => fn())
    this.listeners = []
    this.hideNow()
  }

  hide(): void {
    this.hideNow()
  }

  private insideOwnUi(event: Event): boolean {
    const target = event.target
    return target instanceof Element && Boolean(target.closest?.('[' + ROOT_ATTR + ']'))
  }

  /** The stillness sampler: every 100ms the pointer moves less than 6px, it is one tick stiller. */
  private ensureTick(): void {
    if (this.tickTimer !== null) return
    this.samplePoint = { ...this.lastPoint }
    this.stillTicks = 0
    this.tickTimer = window.setInterval(() => {
      const moved = Math.abs(this.lastPoint.x - this.samplePoint.x) >= STILL_PX || Math.abs(this.lastPoint.y - this.samplePoint.y) >= STILL_PX
      this.samplePoint = { ...this.lastPoint }
      this.stillTicks = moved ? 0 : this.stillTicks + 1
      if (this.stillTicks >= DWELL_TICKS) {
        this.stopTick()
        this.revealGeneration++
        void this.reveal(this.lastPoint.x, this.lastPoint.y, this.revealGeneration)
      }
    }, TICK_MS)
  }

  private stopTick(): void {
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer)
    this.tickTimer = null
    this.stillTicks = 0
  }

  /** Selection, an editable field, or the pointer leaving the window: drop the hover and don't reveal again. */
  private scheduleLeave(): void {
    this.stopTick()
    if (this.leaveTimer !== null) window.clearTimeout(this.leaveTimer)
    this.leaveTimer = window.setTimeout(() => this.hideNow(), LEAVE_MS)
  }

  /** The pointer left the outlined block. Hide that outline, but let a pending dwell reveal whatever it rests on. */
  private armLeave(): void {
    if (this.leaveTimer !== null) window.clearTimeout(this.leaveTimer)
    this.leaveTimer = window.setTimeout(() => {
      this.leaveTimer = null
      this.dismissHover()
    }, LEAVE_MS)
  }

  private clearLeave(): void {
    if (this.leaveTimer !== null) {
      window.clearTimeout(this.leaveTimer)
      this.leaveTimer = null
    }
  }

  private hideNow(): void {
    this.revealGeneration++
    this.stopTick()
    if (this.leaveTimer !== null) window.clearTimeout(this.leaveTimer)
    this.leaveTimer = null
    this.dismissHover()
  }

  private dismissHover(): void {
    this.outlineEl?.remove()
    this.outlineEl = null
    this.labelEl?.remove()
    this.labelEl = null
    this.capsuleEl?.remove()
    this.capsuleEl = null
    this.clearPreview()
    this.doc.querySelector('[' + ROOT_ATTR + '="block-more"]')?.remove()
    this.chain = []
  }

  /** A positive border box that does not contain the point. A zero box (no layout) is not "outside". */
  private pointerOutsideHover(x: number, y: number): boolean {
    const layer = this.chain[this.targetIndex]
    if (!layer || !this.outlineEl) return false
    const rect = candidateRect(layer)
    if (rect.width <= 0 || rect.height <= 0) return false
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom
  }

  private boxContainsPoint(layer: BlockCandidate, x: number, y: number): boolean {
    const rect = candidateRect(layer)
    if (rect.width <= 0 || rect.height <= 0) return true
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  /** Screenshot confirm mode owns the pointer; the clip capsule must not sit on the frame (issue #108). */
  private screenshotConfirming(): boolean {
    return Boolean(this.doc.querySelector('[data-ann-ui="screenshot-session"].ann-shot-modal'))
  }

  private async reveal(x: number, y: number, generation: number): Promise<void> {
    if (generation !== this.revealGeneration) return
    if (this.screenshotConfirming()) {
      this.hideNow()
      return
    }
    if (!(await this.gate.enabled())) return
    if (generation !== this.revealGeneration) return
    if (this.screenshotConfirming()) {
      this.hideNow()
      return
    }
    if (await this.gate.siteDisabled(this.doc.defaultView!.location.hostname)) return
    if (generation !== this.revealGeneration) return
    if (this.screenshotConfirming()) {
      this.hideNow()
      return
    }
    const chain = chainAtPoint(x, y, this.doc)
    if (generation !== this.revealGeneration) return
    // Nothing under the pointer, or only a block the pointer has already left:
    // drop the previous outline instead of leaving it stuck (issue #107).
    if (chain.length === 0) {
      this.dismissHover()
      return
    }
    // The dwell expired, but the page moved on under it: a selection that grew since the move (a drag
    // under way) or a still-held primary button means no capsule — and a stuck outline goes with it
    // (capture.md §6.2, RV-CAP-15). Once the selection collapses and the button is up, the next
    // move's dwell reveals as always.
    const selection = this.doc.getSelection()
    if ((selection && !selection.isCollapsed) || (this.lastPointerButtons & 1) !== 0) {
      this.hideNow()
      return
    }
    const start = startIndexOf(chain)
    // the block entry never appears in page furniture, and a paused block
    // stays quiet until the pointer rests on another start (capture.md §6.2)
    if (isSuppressed(chain, start)) {
      this.dismissHover()
      return
    }
    const target = chain[start]!
    if (this.paused) {
      if (sameLayer(this.paused, target)) {
        this.dismissHover()
        return
      }
      this.paused = null
    }
    if (!this.boxContainsPoint(target, x, y)) {
      this.dismissHover()
      return
    }
    this.clearLeave()
    this.chain = chain
    this.targetIndex = start
    this.levelChanged = false
    this.paintHover()
  }

  /** The block under the pointer pauses: it never reveals while the pointer keeps resting on it. */
  pauseHere(x: number, y: number): void {
    this.stopTick()
    const chain = chainAtPoint(x, y, this.doc)
    if (chain.length === 0) return
    this.paused = chain[startIndexOf(chain)]!
  }

  pauseHereNow(): void {
    this.pauseHere(this.lastPoint.x, this.lastPoint.y)
  }

  private paintHover(): void {
    const layer = this.chain[this.targetIndex]
    if (!layer) return
    this.outlineEl?.remove()
    this.labelEl?.remove()
    const painted = paintOutline(this.doc, layer, false)
    this.outlineEl = painted.outline
    this.labelEl = painted.label
    this.capsuleEl?.remove()
    this.capsuleEl = this.buildCapsule()
    this.doc.documentElement.appendChild(this.capsuleEl)
    const rect = candidateRect(layer)
    positionCapsule(this.doc, this.capsuleEl, rect)
    this.placeLabel()
  }

  private placeLabel(): void {
    const layer = this.chain[this.targetIndex]
    if (!layer || !this.labelEl) return
    const capsuleLeft = this.capsuleEl ? Number.parseFloat(this.capsuleEl.style.left) : null
    placeLabel(this.doc, this.labelEl, layer, Number.isFinite(capsuleLeft) ? capsuleLeft : null)
  }

  /** A level change repaints the outline and label but keeps the capsule where it is; its right edge never moves. */
  private repaintLevel(): void {
    const layer = this.chain[this.targetIndex]
    if (!layer || !this.capsuleEl) return
    this.clearPreview()
    const oldRight = (Number.parseFloat(this.capsuleEl.style.left) || 0) + this.capsuleEl.offsetWidth
    const top = this.capsuleEl.style.top
    this.outlineEl?.remove()
    this.labelEl?.remove()
    const painted = paintOutline(this.doc, layer, false)
    this.outlineEl = painted.outline
    this.labelEl = painted.label
    this.capsuleEl.remove()
    this.capsuleEl = this.buildCapsule()
    this.doc.documentElement.appendChild(this.capsuleEl)
    this.capsuleEl.style.top = top
    this.capsuleEl.style.left = Math.max(0, oldRight - this.capsuleEl.offsetWidth) + 'px'
    this.placeLabel()
  }

  private buildCapsule(): HTMLElement {
    const host = this.doc.createElement('div')
    host.setAttribute(ROOT_ATTR, 'block-capsule')
    host.className = 'ann-block-capsule'
    // Icon-only (capture.md §6.2): the name lives in the tooltip and the accessible label.
    const action = (icon: 'bookmark' | 'scan' | 'download', className: string, key: 'block.clip' | 'block.shot' | 'block.download', onClick: () => void): HTMLButtonElement => {
      const button = this.doc.createElement('button')
      button.type = 'button'
      button.className = 'ann-blk-seg ' + className
      button.setAttribute('aria-label', uiText(key))
      button.title = uiText(key)
      button.append(overlayIcon(this.doc, icon))
      button.addEventListener('click', event => {
        if (!isUserInput(event)) return
        onClick()
      })
      return button
    }

    const layer = this.chain[this.targetIndex]!
    host.append(
      action('bookmark', 'ann-blk-seg-clip', 'block.clip', () => {
        this.hooks.onClip(layer, this.levelChanged)
        this.hideNow()
      }),
    )
    const startScreenshot = this.hooks.onScreenshot
    if (startScreenshot) {
      host.append(
        action('scan', 'ann-blk-seg-shot', 'block.shot', () => {
          startScreenshot(layer)
          this.hideNow()
        }),
      )
    }
    const startDownload = this.hooks.onDownload
    if (startDownload) {
      host.append(
        action('download', 'ann-blk-seg-dl', 'block.download', () => {
          startDownload(layer)
          this.hideNow()
        }),
      )
    }

    const separator = this.doc.createElement('i')
    separator.className = 'ann-blk-sep'
    separator.setAttribute('aria-hidden', 'true')
    host.append(separator)

    // 里一层 appears when the current target holds a layer inside; 外一层 grays out
    // at the outermost layer and never wraps around (capture.md §6.2 换层).
    const levelButton = (icon: 'shrink' | 'expand', key: 'block.shrink' | 'block.expand'): HTMLButtonElement => {
      const button = this.doc.createElement('button')
      button.type = 'button'
      button.className = 'ann-blk-lv'
      button.setAttribute('aria-label', uiText(key))
      button.title = uiText(key)
      button.append(overlayIcon(this.doc, icon))
      button.addEventListener('click', event => {
        if (!isUserInput(event)) return
        this.clearPreview()
        this.targetIndex += icon === 'expand' ? 1 : -1
        this.levelChanged = true
        this.repaintLevel()
      })
      return button
    }

    const outermost = this.targetIndex >= this.chain.length - 1
    const preview = (icon: 'shrink' | 'expand', button: HTMLButtonElement): void => {
      const index = this.targetIndex + (icon === 'expand' ? 1 : -1)
      const next = this.chain[index]
      button.addEventListener('pointerenter', event => {
        if (!isUserInput(event)) return
        this.showPreview(event.clientX, event.clientY, next ?? null, icon === 'expand' ? 'block.expand' : 'block.shrink')
      })
      button.addEventListener('pointerleave', () => this.clearPreview())
    }
    if (this.targetIndex > 0) {
      const shrink = levelButton('shrink', 'block.shrink')
      preview('shrink', shrink)
      host.append(shrink)
    }
    const expand = levelButton('expand', 'block.expand')
    preview('expand', expand)
    if (outermost) {
      expand.disabled = true
      expand.setAttribute('aria-disabled', 'true')
      expand.title = uiText('block.outermost')
      expand.setAttribute('aria-label', uiText('block.outermost'))
    }
    host.append(expand)

    const more = this.doc.createElement('button')
    more.type = 'button'
    more.className = 'ann-blk-sub'
    more.setAttribute('aria-label', uiText('block.more'))
    more.title = uiText('block.more')
    more.appendChild(overlayIcon(this.doc, 'ellipsis'))
    more.addEventListener('click', event => {
      if (!isUserInput(event)) return
      this.openMoreMenu(host)
    })
    host.append(more)
    return host
  }

  /** The dashed outline of the layer a level button would switch to, and its label beside the pointer. */
  private showPreview(x: number, y: number, layer: BlockCandidate | null, key: 'block.expand' | 'block.shrink'): void {
    this.clearPreview()
    const tip = this.doc.createElement('div')
    tip.setAttribute(ROOT_ATTR, 'block-preview-tip')
    tip.className = 'ann-block-preview-tip'
    tip.textContent = layer ? uiText(key) + ' · ' + layerLabel(layer, 'content') : uiText('block.outermost')
    this.doc.documentElement.appendChild(tip)
    const view = this.doc.defaultView!
    const width = tip.offsetWidth || 120
    const height = tip.offsetHeight || 26
    Object.assign(tip.style, {
      left: Math.max(8, Math.min(view.innerWidth - width - 8, x + 12)) + 'px',
      top: Math.max(8, Math.min(view.innerHeight - height - 8, y + 12)) + 'px',
    })
    this.previewTipEl = tip
    if (!layer) return
    const rect = candidateRect(layer)
    const outline = this.doc.createElement('div')
    outline.setAttribute(ROOT_ATTR, 'block-preview')
    outline.className = 'ann-block-preview'
    Object.assign(outline.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' })
    this.doc.documentElement.appendChild(outline)
    this.previewEl = outline
  }

  private clearPreview(): void {
    this.previewEl?.remove()
    this.previewEl = null
    this.previewTipEl?.remove()
    this.previewTipEl = null
  }

  private openMoreMenu(anchor: HTMLElement): void {
    const existing = this.doc.querySelector('[' + ROOT_ATTR + '="block-more"]')
    existing?.remove()
    const menu = this.doc.createElement('div')
    menu.setAttribute(ROOT_ATTR, 'block-more')
    menu.className = 'ann-block-more'
    const item = (key: 'block.disableSite' | 'block.disableEntry' | 'block.settings', onClick: () => void) => {
      const button = this.doc.createElement('button')
      button.type = 'button'
      button.textContent = uiText(key)
      button.addEventListener('click', event => {
        if (!isUserInput(event)) return
        menu.remove()
        onClick()
      })
      menu.appendChild(button)
    }
    item('block.disableSite', () => this.hooks.onDisableSite())
    item('block.disableEntry', () => this.hooks.onDisableEntry())
    item('block.settings', () => this.hooks.openSettings())
    this.doc.documentElement.appendChild(menu)
    const box = anchor.getBoundingClientRect()
    menu.style.left = Math.max(8, box.left) + 'px'
    menu.style.top = Math.min(box.bottom + 6, this.doc.defaultView!.innerHeight - 10) + 'px'
    const close = (event: Event): void => {
      if (event.target instanceof Node && menu.contains(event.target)) return
      menu.remove()
      this.doc.removeEventListener('pointerdown', close, true)
    }
    this.doc.addEventListener('pointerdown', close, true)
  }
}

export class BlockEntries {
  private readonly hover: HoverEntry
  private readonly mode: BlockMode
  private lastClip: { element: Element; rangeStart: Element | null; at: number } | null = null

  constructor(doc: Document, hooks: BlockHoverHooks, gate: SettingsGate) {
    // One gesture clips one block once: a second fire for the same block moments
    // after the first — whatever re-delivered the click — is dropped instead of
    // saved as a second entry with a fresh id (issue #105). A deliberate clip of
    // the same block again has to re-hover it, which already takes longer than
    // the window.
    const offerClip = (candidate: BlockCandidate, levelChanged: boolean): void => {
      const now = Date.now()
      // two run sections share their container: the target is the run, not the element
      if (
        this.lastClip &&
        this.lastClip.element === candidate.element &&
        (this.lastClip.rangeStart ?? null) === (candidate.range?.start ?? null) &&
        now - this.lastClip.at < CLIP_REPEAT_MS
      ) {
        return
      }
      this.lastClip = { element: candidate.element, rangeStart: candidate.range?.start ?? null, at: now }
      hooks.onClip(candidate, levelChanged)
    }
    const wrappedHooks: BlockHoverHooks = { ...hooks, onClip: offerClip }
    this.hover = new HoverEntry(doc, wrappedHooks, gate, () => this.mode.active)
    this.mode = new BlockMode(doc, wrappedHooks, () => this.hover.hide())
  }

  install(): void {
    this.hover.install()
  }

  dispose(): void {
    this.hover.dispose()
    this.mode.dispose()
  }

  hide(): void {
    this.hover.hide()
  }

  /** The block under the pointer pauses (capture.md §6.2 暂停), after the selection menu or the capsule went away. */
  pauseHere(x: number, y: number): void {
    this.hover.pauseHere(x, y)
  }

  pauseHereNow(): void {
    this.hover.pauseHereNow()
  }

  enterBlockMode(): void {
    this.hover.hide()
    this.mode.enter()
  }

  exitBlockMode(): void {
    this.mode.exit()
  }

  isBlockModeActive(): boolean {
    return this.mode.active
  }
}

export type { BlockCandidate }
