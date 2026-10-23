/**
 * The block-clip entries (docs/product/capture.md §6.2): the hover capsule
 * (mouse) and block mode (keyboard). Both point at the same detection and
 * produce the same save; the capsule never covers the page's own controls,
 * stays inside the block's left and right edges, and stays inside the
 * window for tall blocks.
 */
import {
  candidateAnchor,
  candidateRect,
  candidatesAtPoint,
  candidateSummary,
  chainOf,
  childChainOf,
  deepElementFromPoint,
  firstVisibleChain,
  peersOf,
  sameCandidate,
  candidatesFor,
  type BlockCandidate,
  type BlockKind,
} from './blocks'
import { isUserInput } from './user-input'
import { uiText } from '../../utils/ui-text'

const ROOT_ATTR = 'data-ann-ui'
const DWELL_MS = 400
const LEAVE_MS = 150
/** How far the capsule sits inside the block's left and right edges. */
const CAPSULE_EDGE_INSET = 6
/** A repeat clip for the same block inside this window is a replay of one gesture, not a second save (issue #105). */
const CLIP_REPEAT_MS = 1500

export interface BlockHoverHooks {
  onClip(candidate: BlockCandidate, levelChanged: boolean): void
  /** Absent in a child frame: the screenshot session belongs to the top frame's viewport. */
  onScreenshot?(candidate: BlockCandidate): void
  onDisableSite(): void
  onDisableEntry(): void
  openSettings(): void
}

interface SettingsGate {
  enabled(): Promise<boolean>
  siteDisabled(host: string): Promise<boolean>
}

export class BlockEntries {
  private outlineEl: HTMLElement | null = null
  private capsuleEl: HTMLElement | null = null
  private dwellTimer: number | null = null
  private leaveTimer: number | null = null
  private modeActive = false
  private modeLevelChanged = false
  /** The chain of the current target, innermost first — replaced only by a new target, never rebuilt from a unit's own element. */
  private modeChain: BlockCandidate[] = []
  private modeDepth = 0
  private modePainted: BlockCandidate | null = null
  private modeOverlay: HTMLElement | null = null
  private modeKeyHandler: ((event: KeyboardEvent) => void) | null = null
  private modeRepaint: (() => void) | null = null
  private modeStatusEl: HTMLElement | null = null
  private modeKindEl: HTMLElement | null = null
  private modeRestoreFocus: HTMLElement | null = null
  private lastPoint = { x: 0, y: 0 }
  private listeners: (() => void)[] = []

  constructor(
    private readonly doc: Document,
    private readonly hooks: BlockHoverHooks,
    private readonly gate: SettingsGate,
  ) {}

  install(): void {
    const onPointerMove = (event: PointerEvent): void => {
      if (!isUserInput(event)) return
      if (this.modeActive) return
      if (this.screenshotConfirming()) {
        this.hideNow()
        return
      }
      this.lastPoint = { x: event.clientX, y: event.clientY }
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
      // pointer can still reveal the next unit (capture.md §6.2).
      if (this.pointerOutsideHover(event.clientX, event.clientY)) {
        this.armLeave()
        this.scheduleDwell()
        return
      }
      this.clearLeave()
      this.scheduleDwell()
    }
    const onLeaveWindow = (): void => this.scheduleLeave()
    // A visible capsule/outline is anchored to scrolled-away positions: hide
    // it. A pending dwell re-arms instead — the scroll event can trail the
    // pointermove that armed it (hover-with-scroll), and a resting pointer
    // stays eligible after the page settles.
    const onScroll = (): void => {
      if (this.screenshotConfirming()) {
        this.hideNow()
        return
      }
      if (this.capsuleEl || this.outlineEl) this.hideNow()
      else if (this.dwellTimer !== null) this.scheduleDwell()
    }
    const onDragSelect = (event: PointerEvent): void => {
      if (!isUserInput(event)) return
      if (this.screenshotConfirming()) {
        this.hideNow()
        return
      }
      // pressing our own capsule is operating the entry, not starting a drag
      if (this.insideOwnUi(event)) return
      if (event.buttons === 1) this.hideNow()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isUserInput(event) || this.modeActive) return
      // Any key dismisses the hover outline. Escape still does when Parent
      // left focus on the capsule button — that click is our own UI, and
      // ignoring Escape there is what stuck the timeline outline (issue #107).
      if (event.key !== 'Escape' && this.insideOwnUi(event)) return
      this.hideNow()
    }

    this.doc.addEventListener('pointermove', onPointerMove, true)
    this.doc.addEventListener('pointerleave', onLeaveWindow, true)
    this.doc.addEventListener('scroll', onScroll, true)
    this.doc.addEventListener('pointerdown', onDragSelect, true)
    this.doc.addEventListener('keydown', onKeyDown, true)
    this.listeners = [
      () => this.doc.removeEventListener('pointermove', onPointerMove, true),
      () => this.doc.removeEventListener('pointerleave', onLeaveWindow, true),
      () => this.doc.removeEventListener('scroll', onScroll, true),
      () => this.doc.removeEventListener('pointerdown', onDragSelect, true),
      () => this.doc.removeEventListener('keydown', onKeyDown, true),
    ]
  }

  dispose(): void {
    this.listeners.forEach(fn => fn())
    this.listeners = []
    this.hideNow()
    this.exitBlockMode()
  }

  private insideOwnUi(event: Event): boolean {
    const target = event.target
    return target instanceof Element && Boolean(target.closest?.(`[${ROOT_ATTR}]`))
  }

  private scheduleDwell(): void {
    if (this.dwellTimer !== null) window.clearTimeout(this.dwellTimer)
    const generation = ++this.revealGeneration
    const { x, y } = this.lastPoint
    this.dwellTimer = window.setTimeout(() => {
      this.dwellTimer = null
      void this.reveal(x, y, generation)
    }, DWELL_MS)
  }

  /** Selection, an editable field, or the pointer leaving the window: drop the hover and don't reveal again. */
  private scheduleLeave(): void {
    if (this.dwellTimer !== null) {
      window.clearTimeout(this.dwellTimer)
      this.dwellTimer = null
    }
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

  hide(): void {
    this.hideNow()
  }

  private hideNow(): void {
    this.revealGeneration++
    if (this.dwellTimer !== null) window.clearTimeout(this.dwellTimer)
    if (this.leaveTimer !== null) window.clearTimeout(this.leaveTimer)
    this.dwellTimer = null
    this.leaveTimer = null
    this.dismissHover()
  }

  private dismissHover(): void {
    this.outlineEl?.remove()
    this.outlineEl = null
    this.capsuleEl?.remove()
    this.capsuleEl = null
    this.doc.querySelector(`[${ROOT_ATTR}="block-more"]`)?.remove()
    this.hoverCandidate = null
    this.hoverChain = []
    this.hoverDepth = 0
  }

  private hoverCandidate: BlockCandidate | null = null
  private hoverChain: BlockCandidate[] = []
  private hoverDepth = 0
  /** The last clip this page started, to drop a replay of the same gesture (issue #105). */
  private lastClip: { element: Element; at: number } | null = null

  /**
   * One gesture clips one block once: a second fire for the same block moments
   * after the first — whatever re-delivered the click — is dropped instead of
   * saved as a second entry with a fresh id (issue #105). A deliberate clip of
   * the same block again has to re-hover it, which already takes longer than
   * the window.
   */
  private offerClip(candidate: BlockCandidate, levelChanged: boolean): void {
    const now = Date.now()
    if (this.lastClip && this.lastClip.element === candidate.element && now - this.lastClip.at < CLIP_REPEAT_MS) return
    this.lastClip = { element: candidate.element, at: now }
    this.hooks.onClip(candidate, levelChanged)
  }

  /** Bumped when a newer dwell or a hard dismiss invalidates an in-flight reveal. */
  private revealGeneration = 0

  /** A positive border box that does not contain the point. A zero box (no layout) is not "outside". */
  private pointerOutsideHover(x: number, y: number): boolean {
    const candidate = this.hoverCandidate
    if (!candidate || !this.outlineEl) return false
    const rect = candidateRect(candidate)
    if (rect.width <= 0 || rect.height <= 0) return false
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom
  }

  private boxContainsPoint(candidate: BlockCandidate, x: number, y: number): boolean {
    const rect = candidateRect(candidate)
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
    const chain = candidatesAtPoint(x, y, this.doc)
    if (generation !== this.revealGeneration) return
    // Nothing under the pointer, or only a block the pointer has already left:
    // drop the previous outline instead of leaving it stuck (issue #107).
    if (chain.length === 0) {
      this.dismissHover()
      return
    }
    const previous = this.hoverCandidate
    this.hoverChain = chain
    const sameIndex = previous ? chain.findIndex(c => c.element === previous.element) : 0
    let depth = sameIndex >= 0 ? Math.min(this.hoverDepth, sameIndex) : 0
    let candidate = chain[depth] ?? chain[0]!
    if (!this.boxContainsPoint(candidate, x, y)) {
      const inner = chain[0]!
      if (!this.boxContainsPoint(inner, x, y)) {
        this.dismissHover()
        return
      }
      candidate = inner
      depth = 0
    }
    this.clearLeave()
    this.hoverCandidate = candidate
    this.hoverDepth = chain.indexOf(candidate)
    if (this.hoverDepth < 0) this.hoverDepth = depth
    this.paintHover()
  }

  private paintHover(): void {
    const candidate = this.hoverCandidate
    if (!candidate) return
    this.outlineEl?.remove()
    const outline = this.doc.createElement('div')
    outline.setAttribute(ROOT_ATTR, 'block-outline')
    outline.className = 'ann-block-outline'
    const rect = candidateRect(candidate)
    Object.assign(outline.style, {
      left: `${rect.left}px`,
      top: `${rect.top + this.doc.defaultView!.scrollY - window.scrollY}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    ;(this.doc.documentElement as HTMLElement).appendChild(outline)
    this.outlineEl = outline

    this.capsuleEl?.remove()
    this.capsuleEl = this.buildCapsule(candidate, false)
    this.doc.documentElement.appendChild(this.capsuleEl)
    this.positionCapsule(this.capsuleEl, rect)
  }

  private buildCapsule(candidate: BlockCandidate, keyboard: boolean): HTMLElement {
    const host = this.doc.createElement('div')
    host.setAttribute(ROOT_ATTR, keyboard ? 'block-mode-capsule' : 'block-capsule')
    host.className = 'ann-block-capsule'

    const clip = this.doc.createElement('button')
    clip.type = 'button'
    clip.textContent = uiText('block.clip')
    clip.addEventListener('click', event => {
      if (!isUserInput(event)) return
      this.offerClip(candidate, this.hoverDepth > 0 || this.modeLevelChanged)
      if (!keyboard) this.hideNow()
    })

    host.append(clip)
    const startScreenshot = this.hooks.onScreenshot
    if (startScreenshot) {
      const shot = this.doc.createElement('button')
      shot.type = 'button'
      shot.textContent = uiText('block.shot')
      shot.addEventListener('click', event => {
        if (!isUserInput(event)) return
        startScreenshot.call(this.hooks, candidate)
        if (!keyboard) this.hideNow()
      })
      host.append(shot)
    }

    if (!keyboard) {
      const up = this.doc.createElement('button')
      up.type = 'button'
      up.textContent = '⌃'
      up.setAttribute('aria-label', uiText('block.up'))
      up.disabled = this.hoverDepth >= this.hoverChain.length - 1
      up.addEventListener('click', event => {
        if (!isUserInput(event)) return
        this.hoverDepth = Math.min(this.hoverDepth + 1, this.hoverChain.length - 1)
        this.hoverCandidate = this.hoverChain[this.hoverDepth]!
        this.paintHover()
      })
      host.appendChild(up)
    }

    const more = this.doc.createElement('button')
    more.type = 'button'
    more.textContent = uiText('block.more')
    more.addEventListener('click', event => {
      if (!isUserInput(event)) return
      this.openMoreMenu(host)
    })
    host.appendChild(more)
    return host
  }

  private openMoreMenu(anchor: HTMLElement): void {
    const existing = this.doc.querySelector(`[${ROOT_ATTR}="block-more"]`)
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
    menu.style.left = `${Math.max(8, box.left)}px`
    menu.style.top = `${Math.min(box.bottom + 6, this.doc.defaultView!.innerHeight - 10)}px`
    const close = (event: Event): void => {
      if (event.target instanceof Node && menu.contains(event.target)) return
      menu.remove()
      this.doc.removeEventListener('pointerdown', close, true)
    }
    this.doc.addEventListener('pointerdown', close, true)
  }

  /**
   * Capsule placement (capture.md §6.2): prefers the block's right-top corner.
   * The top edge is straddled so a tall block can pin to the visible top of
   * the window; the left and right edges stay inside the block. Centering on
   * the corner (`right - width/2`) hangs half the capsule off the side — on a
   * timeline that half covers the sidebar (about 82px at 110% zoom). Occupied
   * corners yield to left-top, right-bottom, left-bottom, then a slide along
   * the top edge. Occupation is probed across the whole capsule box, not one
   * point — a small button inside the area still counts.
   */
  private positionCapsule(capsule: HTMLElement, rect: DOMRect): void {
    const view = this.doc.defaultView!
    const box = { width: capsule.offsetWidth || 260, height: capsule.offsetHeight || 36 }
    const visibleTop = Math.max(rect.top, 0)
    const yTop = visibleTop - box.height / 2
    const yBottom = Math.min(rect.bottom, view.innerHeight) - box.height / 2
    // 6px inside the block, same inset as the hover-capsule mock. The right
    // edge of the capsule is `rect.right - 6`, never `rect.right + width/2`.
    const xRight = rect.right - box.width - CAPSULE_EDGE_INSET
    const xLeft = rect.left + CAPSULE_EDGE_INSET
    const corners: [number, number][] = [
      [xRight, yTop],
      [xLeft, yTop],
      [xRight, yBottom],
      [xLeft, yBottom],
    ]
    let [x, y] = corners[0]!
    for (const [cx, cy] of corners) {
      if (!this.capsuleAreaOccupied(cx, cy, box, capsule)) {
        x = cx
        y = cy
        break
      }
    }
    if (this.capsuleAreaOccupied(x, y, box, capsule)) {
      // all four corners taken (an X post's are): slide along the top edge
      // instead of sitting on the corner's controls (真机走查 P2-4)
      const topY = corners[0]![1]
      const minX = Math.max(0, rect.left)
      for (let cx = corners[0]![0] - 24; cx >= minX; cx -= 24) {
        if (!this.capsuleAreaOccupied(cx, topY, box, capsule)) {
          x = cx
          y = topY
          break
        }
      }
    }
    let left = Math.max(0, Math.min(view.innerWidth - box.width, x))
    const top = Math.max(0, Math.min(view.innerHeight - box.height, y))
    // A viewport clamp must not push the capsule back out over the sidebar
    // when the block itself fits on screen.
    if (box.width <= rect.width && rect.left >= 0 && rect.right <= view.innerWidth) {
      left = Math.min(Math.max(left, rect.left), rect.right - box.width)
    }
    capsule.style.left = `${left}px`
    capsule.style.top = `${top}px`
  }

  /** Sample points across the would-be capsule box for page controls under it. */
  private capsuleAreaOccupied(cx: number, cy: number, box: { width: number; height: number }, capsule: HTMLElement): boolean {
    const view = this.doc.defaultView!
    const clampX = (x: number) => Math.max(1, Math.min(view.innerWidth - 1, x))
    const clampY = (y: number) => Math.max(1, Math.min(view.innerHeight - 1, y))
    // dense enough that a common 30px icon button cannot fall between probes
    // (真机走查 P2-4：代码块右上角的按钮正好落在两个采样点之间)
    const step = 24
    const nx = Math.max(2, Math.ceil(box.width / step))
    const ny = Math.max(2, Math.ceil(box.height / step))
    for (let ix = 0; ix <= nx; ix++) {
      for (let iy = 0; iy <= ny; iy++) {
        const probe = this.doc.elementFromPoint(clampX(cx + (box.width * ix) / nx), clampY(cy + (box.height * iy) / ny))
        if (probe instanceof Element && probe !== capsule && !capsule.contains(probe) && this.isPageControl(probe)) return true
      }
    }
    return false
  }

  private isPageControl(el: Element): boolean {
    const tag = el.tagName.toLowerCase()
    if (['a', 'button', 'input', 'select', 'summary'].includes(tag)) return true
    return el.getAttribute('role') === 'button' || el.closest('a,button,summary,[role="button"]') !== null
  }

  // ── Block mode (keyboard) ─────────────────────────────────────────────

  enterBlockMode(): void {
    if (this.modeActive) {
      this.exitBlockMode()
      return
    }
    this.hideNow()
    // The first target comes from where the user is — the focused element, else the first unit on
    // screen (capture.md §6.2) — and is found before the overlay exists, so hit-testing sees the page.
    const initial = this.initialModeChain()
    this.modeActive = true
    this.modeLevelChanged = false
    this.modeChain = []
    this.modeDepth = 0
    this.modePainted = null

    const overlay = this.doc.createElement('div')
    overlay.setAttribute(ROOT_ATTR, 'block-mode-overlay')
    overlay.className = 'ann-block-mode-overlay'
    // One live region: the kind and the unit's own words change with the target; the key hint
    // never changes, so it is announced once with the mode and not on every move.
    const status = this.doc.createElement('div')
    status.className = 'ann-block-mode-status'
    status.setAttribute(ROOT_ATTR, 'block-mode-capsule')
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    status.setAttribute('aria-atomic', 'false')
    const kind = this.doc.createElement('span')
    kind.className = 'ann-block-mode-kind'
    const hint = this.doc.createElement('span')
    hint.className = 'ann-block-mode-hint'
    hint.textContent = uiText(this.hooks.onScreenshot ? 'block.mode.hint' : 'block.mode.hintClipOnly')
    status.append(kind, hint)
    this.doc.documentElement.append(overlay, status)
    // Keys must reach this document: a user whose focus sat in a child frame would otherwise type
    // into that frame while the mode waits here. The previous focus comes back on exit.
    const previousFocus = this.doc.activeElement
    this.modeRestoreFocus = previousFocus instanceof HTMLElement && previousFocus !== this.doc.body ? previousFocus : null
    overlay.tabIndex = -1
    overlay.focus({ preventScroll: true })

    overlay.addEventListener('pointermove', event => {
      if (!isUserInput(event)) return
      this.lastPoint = { x: event.clientX, y: event.clientY }
      this.refreshFromPointer()
    })
    // links do not respond to clicks inside the mode (capture.md §6.2)
    overlay.addEventListener('pointerdown', event => event.preventDefault())

    const onKey = (event: KeyboardEvent): void => {
      if (!isUserInput(event)) return
      if (!this.modeActive) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        this.exitBlockMode()
        return
      }
      if (event.key === 'Tab') {
        this.moveToPeer(event.shiftKey ? -1 : 1)
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        // the chain stays what it was: ↓ walks back down the same chain ↑ walked up
        const next = this.modeDepth + (event.key === 'ArrowUp' ? 1 : -1)
        if (next >= 0 && next < this.modeChain.length) {
          this.modeLevelChanged = true
          this.modeDepth = next
          this.paintMode(true)
          return
        }
        // ↓ at the innermost level enters the unit (真机走查 P2-1：区块模式停在整篇
        // 文章下不去), one level at a time: the outermost unit inside it first.
        // The child chain is spliced in front, so the next ↓ goes on down it and
        // ↑ walks back out the way ↓ came in.
        if (event.key === 'ArrowDown' && this.modeDepth === 0) {
          const current = this.modeChain[this.modeDepth]
          if (!current) return
          const inner = childChainOf(current, this.doc).filter(candidate => !this.modeChain.some(existing => sameCandidate(existing, candidate)))
          if (inner.length === 0) return
          this.modeLevelChanged = true
          this.modeChain = [...inner, ...this.modeChain]
          this.modeDepth = inner.length - 1
          this.paintMode(true)
        }
        return
      }
      if (event.key === 'Enter') {
        const candidate = this.modeChain[this.modeDepth]
        if (candidate) {
          this.offerClip(candidate, this.modeLevelChanged)
          this.exitBlockMode()
        }
        return
      }
      if (event.key.toLowerCase() === 's' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const candidate = this.modeChain[this.modeDepth]
        if (candidate && this.hooks.onScreenshot) {
          this.hooks.onScreenshot(candidate)
          this.exitBlockMode()
        }
      }
    }
    this.doc.addEventListener('keydown', onKey, true)
    // the outline is fixed to the window: a page that scrolls under it needs it repainted
    const repaint = (): void => this.paintMode(false, true)
    this.doc.addEventListener('scroll', repaint, true)
    this.doc.defaultView?.addEventListener('resize', repaint)
    this.modeRepaint = repaint
    this.modeOverlay = overlay
    this.modeKeyHandler = onKey
    this.modeStatusEl = status
    this.modeKindEl = kind
    if (initial.length > 0) this.setModeChain(initial, 0, true)
  }

  private initialModeChain(): BlockCandidate[] {
    const focused = this.doc.activeElement
    if (focused instanceof Element && focused !== this.doc.body && focused !== this.doc.documentElement) {
      const chain = candidatesFor(focused, this.doc)
      if (chain.length > 0) return chain
    }
    return firstVisibleChain(this.doc)
  }

  /** A new target replaces the chain; the depth the user chose is kept as far as the new chain reaches. */
  private setModeChain(chain: BlockCandidate[], depth: number, scroll: boolean): void {
    this.modeChain = chain
    this.modeDepth = Math.max(0, Math.min(depth, chain.length - 1))
    this.paintMode(scroll)
  }

  private refreshFromPointer(): void {
    if (!this.modeActive) return
    // hit-test through the mode overlay: it sits on top of the page by design
    if (this.modeOverlay) this.modeOverlay.style.pointerEvents = 'none'
    const chain = candidatesAtPoint(this.lastPoint.x, this.lastPoint.y, this.doc)
    if (this.modeOverlay) this.modeOverlay.style.pointerEvents = ''
    // nothing under the pointer: the previous target stays, outlined, so what is painted is what Enter saves
    if (chain.length === 0) return
    this.setModeChain(chain, this.modeDepth, false)
  }

  /** Tab / Shift+Tab: the next or previous unit of the same kind, in document order, wrapping around. */
  private moveToPeer(step: 1 | -1): void {
    const current = this.modeChain[this.modeDepth]
    if (!current) return
    const peers = peersOf(current, this.doc)
    if (peers.length < 2) return
    const index = peers.findIndex(peer => sameCandidate(peer, current))
    const next = peers[(index + step + peers.length) % peers.length]!
    // the chain is detected from the unit itself, so ↑↓ keep working from the new position
    const chain = chainOf(next, this.doc)
    const depth = chain.findIndex(candidate => sameCandidate(candidate, next))
    this.setModeChain(depth >= 0 ? chain : [next], Math.max(depth, 0), true)
  }

  /** Outlines the current target and says what it is. `scroll`: bring it into view (keyboard moves only). */
  private paintMode(scroll: boolean, force = false): void {
    const candidate = this.modeChain[this.modeDepth]
    if (!candidate) return
    if (!force && !scroll && this.modePainted && sameCandidate(this.modePainted, candidate)) return
    this.modePainted = candidate
    if (scroll) candidateAnchor(candidate).scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
    this.outlineEl?.remove()
    const outline = this.doc.createElement('div')
    outline.setAttribute(ROOT_ATTR, 'block-outline')
    outline.className = 'ann-block-outline ann-block-outline-keyboard'
    const rect = candidateRect(candidate)
    Object.assign(outline.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    this.doc.documentElement.appendChild(outline)
    this.outlineEl = outline
    if (this.modeKindEl) {
      const kind = uiText(`block.kind.${candidate.kind}` as 'block.kind.post')
      const summary = candidateSummary(candidate)
      const text = summary ? `${kind} · ${summary}` : kind
      if (this.modeKindEl.textContent !== text) this.modeKindEl.textContent = text
    }
  }

  exitBlockMode(): void {
    if (this.modeKeyHandler) this.doc.removeEventListener('keydown', this.modeKeyHandler, true)
    if (this.modeRepaint) {
      this.doc.removeEventListener('scroll', this.modeRepaint, true)
      this.doc.defaultView?.removeEventListener('resize', this.modeRepaint)
    }
    this.modeKeyHandler = null
    this.modeRepaint = null
    const restoreFocus = this.modeRestoreFocus
    this.modeRestoreFocus = null
    this.modeOverlay?.remove()
    this.modeOverlay = null
    this.modeStatusEl?.remove()
    this.modeStatusEl = null
    this.modeKindEl = null
    this.outlineEl?.remove()
    this.outlineEl = null
    this.modeActive = false
    this.modeChain = []
    this.modePainted = null
    this.modeDepth = 0
    if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true })
  }

  isBlockModeActive(): boolean {
    return this.modeActive
  }
}

export type { BlockKind, BlockCandidate }
export { deepElementFromPoint }
