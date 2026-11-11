/**
 * The block-clip hover entry (docs/product/capture.md §6.2): the pointer
 * rests on a start — the innermost block under it, a heading's section, or
 * the block big enough beyond a small one — and the outline, its label and
 * the capsule appear. The range is decided by where the pointer stops: the
 * capsule clips, screenshots and downloads that layer, and has no level
 * buttons; to climb the chain, use the keyboard block mode or the screenshot
 * viewfinder's ↑ ↓. The keyboard block mode lives in block-mode.ts and reads
 * the same chain.
 */
import { isUserInput } from './user-input'
import { overlayIcon } from './icons'
import { uiText } from './ui-text'
import { positionCapsule, type PlacedBox } from './capsule-place'
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

/** The air kept between the label and what it sits next to: the outline's top edge and the capsule. */
const LABEL_AIR = 4

/** Whether two boxes touch, with a little air between them. */
function boxesTouch(a: PlacedBox, b: PlacedBox): boolean {
  return a.left < b.right + LABEL_AIR && a.right > b.left - LABEL_AIR && a.top < b.bottom + LABEL_AIR && a.bottom > b.top - LABEL_AIR
}

/**
 * Places the label above the outline's top edge, at its left end (right end
 * when the capsule sits at the left). A block too close to the top of the
 * window for that pins the label to the visible top; a block narrower than
 * 260px, or one whose label would touch the capsule, keeps the kind alone, and
 * a kind that still touches goes up above the capsule (capture.md §6.2
 * 标注怎样写). The capsule is the box `positionCapsule` placed: its rectangle
 * read back is still 4px into its entry animation.
 */
export function placeLabel(doc: Document, label: HTMLElement, layer: BlockCandidate, capsule: PlacedBox | null): void {
  const rect = candidateRect(layer)
  const view = doc.defaultView!
  // a zero box has no layout to measure (jsdom): the full label stays
  const laidOut = rect.width > 0
  const capsuleBox = laidOut ? capsule : null
  const place = (text: string): PlacedBox => {
    label.textContent = text
    const height = label.offsetHeight || 24
    const width = label.offsetWidth || 80
    let left = rect.left + 4
    // the capsule in the left half of the block (its right corner was taken): the label takes the right end
    if (capsuleBox && (capsuleBox.left + capsuleBox.right) / 2 < rect.left + rect.width / 2) left = rect.right - width - 4
    left = Math.max(8, Math.min(view.innerWidth - width - 8, left))
    // above the top edge when there is room for it in the window, else pinned to the visible top
    const above = rect.top - height - LABEL_AIR
    const top = above >= 4 ? above : 4
    return { left, top, right: left + width, bottom: top + height }
  }
  const kind = layerKindName(layer)
  let box = place(laidOut && rect.width < NARROW_LABEL_PX ? kind : layerLabel(layer, 'content'))
  if (capsuleBox && boxesTouch(box, capsuleBox)) {
    if (label.textContent !== kind) box = place(kind)
    // even the kind alone runs into it (a block barely wider than the capsule): the label goes up above the capsule
    if (boxesTouch(box, capsuleBox)) {
      const height = box.bottom - box.top
      const lifted = capsuleBox.top - height - LABEL_AIR
      if (lifted >= 4) box = { ...box, top: lifted, bottom: lifted + height }
    }
  }
  Object.assign(label.style, { left: box.left + 'px', top: box.top + 'px' })
}

class HoverEntry {
  private target: BlockCandidate | null = null
  private paused: BlockCandidate | null = null
  private outlineEl: HTMLElement | null = null
  private labelEl: HTMLElement | null = null
  private capsuleEl: HTMLElement | null = null
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
      if (this.screenshotSessionActive()) {
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
    // pointerleave does not bubble, yet this capture listener hears every element the pointer leaves:
    // only leaving the document is leaving the window. An element that appears under a resting pointer
    // (our own capsule, a popover) fires a leave towards it, and nothing moved.
    const onLeaveWindow = (event: PointerEvent): void => {
      const next = event.relatedTarget
      if (next instanceof Node && next.ownerDocument === this.doc) return
      this.stopTick()
      this.scheduleLeave()
    }
    // A visible capsule/outline is anchored to scrolled-away positions: hide
    // it. A resting pointer stays eligible after the page settles — the
    // stillness clock restarts and the next reveal hit-tests the page afresh.
    const onScroll = (): void => {
      if (this.screenshotSessionActive()) {
        this.hideNow()
        return
      }
      this.hideNow()
      this.ensureTick()
    }
    const onDragSelect = (event: PointerEvent): void => {
      if (!isUserInput(event)) return
      this.lastPointerButtons = event.buttons
      if (this.screenshotSessionActive()) {
        this.hideNow()
        return
      }
      // pressing our own capsule is operating the entry, not starting a drag
      if (this.insideOwnUi(event)) return
      if (event.buttons === 1) this.hideNow()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isUserInput(event) || this.isModeActive()) return
      // a screenshot session handles its own keys: the hover stays out and never pauses
      if (this.screenshotSessionActive()) {
        this.hideNow()
        return
      }
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
    // the shortcut can open a session while the capsule is visible and the
    // pointer is still: hide the moment the session appears, not on the next move
    const sessionWatch = new MutationObserver(() => {
      if (this.screenshotSessionActive()) this.hideNow()
    })
    sessionWatch.observe(this.doc.documentElement, { childList: true })
    this.listeners = [
      () => this.doc.removeEventListener('pointermove', onPointerMove, true),
      () => this.doc.removeEventListener('pointerleave', onLeaveWindow, true),
      () => this.doc.removeEventListener('scroll', onScroll, true),
      () => this.doc.removeEventListener('pointerdown', onDragSelect, true),
      () => this.doc.removeEventListener('pointerup', onButtonsChange, true),
      () => this.doc.removeEventListener('keydown', onKeyDown, true),
      () => sessionWatch.disconnect(),
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
    this.doc.querySelector('[' + ROOT_ATTR + '="block-more"]')?.remove()
    this.target = null
  }

  /** A positive border box that does not contain the point. A zero box (no layout) is not "outside". */
  private pointerOutsideHover(x: number, y: number): boolean {
    const layer = this.target
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

  /**
   * A screenshot session owns the pointer in every state — picking, confirming
   * and the editor alike: the clip capsule never sits on it. The viewfinder is
   * click-through, so hit-testing alone cannot keep the capsule away (issue #108).
   */
  private screenshotSessionActive(): boolean {
    return Boolean(this.doc.querySelector('[data-ann-ui="screenshot-session"]'))
  }

  private async reveal(x: number, y: number, generation: number): Promise<void> {
    if (generation !== this.revealGeneration) return
    if (this.screenshotSessionActive()) {
      this.hideNow()
      return
    }
    if (!(await this.gate.enabled())) return
    if (generation !== this.revealGeneration) return
    if (this.screenshotSessionActive()) {
      this.hideNow()
      return
    }
    if (await this.gate.siteDisabled(this.doc.defaultView!.location.hostname)) return
    if (generation !== this.revealGeneration) return
    if (this.screenshotSessionActive()) {
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
    // the hover target is always the start: the range is decided by where the
    // pointer stops, the capsule has no level buttons (capture.md §6.2)
    this.target = target
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
    const layer = this.target
    if (!layer) return
    this.outlineEl?.remove()
    this.labelEl?.remove()
    const painted = paintOutline(this.doc, layer, false)
    this.outlineEl = painted.outline
    this.labelEl = painted.label
    this.capsuleEl?.remove()
    this.capsuleEl = this.buildCapsule()
    this.doc.documentElement.appendChild(this.capsuleEl)
    const capsuleBox = positionCapsule(this.doc, this.capsuleEl, candidateRect(layer))
    placeLabel(this.doc, painted.label, layer, capsuleBox)
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

    const layer = this.target!
    host.append(
      action('bookmark', 'ann-blk-seg-clip', 'block.clip', () => {
        // the hover never changes levels: only the keyboard mode's ↑ ↓ do (capture.md §6.2)
        this.hooks.onClip(layer, false)
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
