/**
 * The block-clip entries (docs/v2/capture.md §6.2): the hover capsule
 * (mouse) and block mode (keyboard). Both point at the same detection and
 * produce the same save; the capsule never covers the page's own controls
 * and stays inside the window for tall blocks.
 */
import { candidatesAtPoint, deepElementFromPoint, type BlockCandidate, type BlockKind } from './blocks'
import { isUserInput } from './user-input'
import { uiText } from '../../utils/ui-text'

const ROOT_ATTR = 'data-ann-ui'
const DWELL_MS = 400
const LEAVE_MS = 150

export interface BlockHoverHooks {
  onClip(candidate: BlockCandidate, levelChanged: boolean): void
  onScreenshot(candidate: BlockCandidate): void
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
  private modeIndex = 0
  private modeLevelChanged = false
  private modeCandidates: BlockCandidate[] = []
  private modeOverlay: HTMLElement | null = null
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
      this.lastPoint = { x: event.clientX, y: event.clientY }
      if (this.insideOwnUi(event)) {
        this.scheduleLeave()
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
      this.clearLeave()
      this.scheduleDwell()
    }
    const onLeaveWindow = (): void => this.scheduleLeave()
    const onScroll = (): void => this.hideNow()
    const onDragSelect = (event: PointerEvent): void => {
      if (isUserInput(event) && event.buttons === 1) this.hideNow()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isUserInput(event) && !this.modeActive && event.key !== 'Escape') this.hideNow()
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

  private insideOwnUi(event: PointerEvent): boolean {
    const target = event.target
    return target instanceof Element && Boolean(target.closest?.(`[${ROOT_ATTR}]`))
  }

  private scheduleDwell(): void {
    if (this.dwellTimer !== null) window.clearTimeout(this.dwellTimer)
    const { x, y } = this.lastPoint
    this.dwellTimer = window.setTimeout(() => void this.reveal(x, y), DWELL_MS)
  }

  private scheduleLeave(): void {
    if (this.dwellTimer !== null) {
      window.clearTimeout(this.dwellTimer)
      this.dwellTimer = null
    }
    if (this.leaveTimer !== null) window.clearTimeout(this.leaveTimer)
    this.leaveTimer = window.setTimeout(() => this.hideNow(), LEAVE_MS)
  }

  private clearLeave(): void {
    if (this.leaveTimer !== null) {
      window.clearTimeout(this.leaveTimer)
      this.leaveTimer = null
    }
  }

  private hideNow(): void {
    if (this.dwellTimer !== null) window.clearTimeout(this.dwellTimer)
    if (this.leaveTimer !== null) window.clearTimeout(this.leaveTimer)
    this.dwellTimer = null
    this.leaveTimer = null
    this.outlineEl?.remove()
    this.outlineEl = null
    this.capsuleEl?.remove()
    this.capsuleEl = null
    this.hoverCandidate = null
    this.hoverDepth = 0
  }

  private hoverCandidate: BlockCandidate | null = null
  private hoverChain: BlockCandidate[] = []
  private hoverDepth = 0

  private async reveal(x: number, y: number): Promise<void> {
    if (!(await this.gate.enabled())) return
    if (await this.gate.siteDisabled(this.doc.defaultView!.location.hostname)) return
    const chain = candidatesAtPoint(x, y, this.doc)
    if (chain.length === 0) return
    // innermost first; a hover that repeats the same element keeps its depth
    const previous = this.hoverCandidate
    this.hoverChain = chain
    const sameIndex = previous ? chain.findIndex(c => c.element === previous.element) : 0
    this.hoverDepth = sameIndex >= 0 ? Math.min(this.hoverDepth, sameIndex) : 0
    this.hoverCandidate = chain[this.hoverDepth] ?? chain[0]!
    this.hoverDepth = chain.indexOf(this.hoverCandidate)
    this.paintHover()
  }

  private paintHover(): void {
    const candidate = this.hoverCandidate
    if (!candidate) return
    this.outlineEl?.remove()
    const outline = this.doc.createElement('div')
    outline.setAttribute(ROOT_ATTR, 'block-outline')
    outline.className = 'ann-block-outline'
    const rect = candidate.element.getBoundingClientRect()
    Object.assign(outline.style, {
      left: `${rect.left}px`,
      top: `${rect.top + this.doc.defaultView!.scrollY - window.scrollY}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    ;(this.doc.documentElement as HTMLElement).appendChild(outline)
    this.outlineEl = outline

    this.capsuleEl?.remove()
    this.capsule = this.buildCapsule(candidate, false)
    this.doc.documentElement.appendChild(this.capsule)
    this.positionCapsule(this.capsule, rect)
  }

  private capsule!: HTMLElement

  private buildCapsule(candidate: BlockCandidate, keyboard: boolean): HTMLElement {
    const host = this.doc.createElement('div')
    host.setAttribute(ROOT_ATTR, keyboard ? 'block-mode-capsule' : 'block-capsule')
    host.className = 'ann-block-capsule'

    const clip = this.doc.createElement('button')
    clip.type = 'button'
    clip.textContent = uiText('block.clip')
    clip.addEventListener('click', event => {
      if (!isUserInput(event)) return
      this.hooks.onClip(candidate, this.hoverDepth > 0 || this.modeLevelChanged)
      if (!keyboard) this.hideNow()
    })

    const shot = this.doc.createElement('button')
    shot.type = 'button'
    shot.textContent = uiText('block.shot')
    shot.addEventListener('click', event => {
      if (!isUserInput(event)) return
      this.hooks.onScreenshot(candidate)
      if (!keyboard) this.hideNow()
    })

    host.append(clip, shot)

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
   * Capsule placement (capture.md §6.2): straddles the block's edge at the
   * right-top corner; a block taller than the window clamps to the visible
   * top; occupied corners yield to left-top, right-bottom, left-bottom, and
   * finally the pointer side.
   */
  private positionCapsule(capsule: HTMLElement, rect: DOMRect): void {
    const view = this.doc.defaultView!
    const box = { width: capsule.offsetWidth || 260, height: capsule.offsetHeight || 36 }
    const visibleTop = Math.max(rect.top, 0)
    const corners: [number, number][] = [
      [rect.right - box.width / 2, visibleTop - box.height / 2], // right-top, straddling the edge
      [rect.left - box.width / 2, visibleTop - box.height / 2], // left-top
      [rect.right - box.width / 2, Math.min(rect.bottom, view.innerHeight) - box.height / 2], // right-bottom
      [rect.left - box.width / 2, Math.min(rect.bottom, view.innerHeight) - box.height / 2], // left-bottom
    ]
    let [x, y] = corners[0]!
    for (const [cx, cy] of corners) {
      const probe = this.doc.elementFromPoint(Math.max(1, Math.min(view.innerWidth - 1, cx + box.width / 2 - 4)), Math.max(1, Math.min(view.innerHeight - 1, cy + box.height / 2)))
      const occupied = probe instanceof Element && probe !== capsule && !capsule.contains(probe) && !this.outlineEl?.contains(probe) && this.isPageControl(probe)
      if (!occupied) {
        x = cx
        y = cy
        break
      }
    }
    capsule.style.left = `${Math.max(0, Math.min(view.innerWidth - box.width, x))}px`
    capsule.style.top = `${Math.max(0, Math.min(view.innerHeight - box.height, y))}px`
  }

  private isPageControl(el: Element): boolean {
    const tag = el.tagName.toLowerCase()
    if (['a', 'button', 'input', 'select'].includes(tag)) return true
    return el.getAttribute('role') === 'button' || el.closest('a,button,[role="button"]') !== null
  }

  // ── Block mode (keyboard) ─────────────────────────────────────────────

  enterBlockMode(): void {
    if (this.modeActive) {
      this.exitBlockMode()
      return
    }
    this.hideNow()
    this.modeActive = true
    this.modeLevelChanged = false
    this.modeIndex = 0

    const overlay = this.doc.createElement('div')
    overlay.setAttribute(ROOT_ATTR, 'block-mode-overlay')
    overlay.className = 'ann-block-mode-overlay'
    const status = this.doc.createElement('div')
    status.className = 'ann-block-mode-status'
    status.setAttribute(ROOT_ATTR, 'block-mode-capsule')
    status.textContent = uiText('block.mode.hint')
    this.doc.documentElement.append(overlay, status)

    overlay.addEventListener('pointermove', event => {
      if (!isUserInput(event)) return
      this.lastPoint = { x: event.clientX, y: event.clientY }
      this.refreshModeTarget()
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
        this.modeIndex += event.shiftKey ? -1 : 1
        this.refreshModeTarget(true)
        return
      }
      if (event.key === 'ArrowUp') {
        this.modeDepth = Math.min(this.modeDepth + 1, Math.max(0, this.modeCandidates.length - 1))
        this.modeLevelChanged = true
        this.refreshModeTarget()
        return
      }
      if (event.key === 'ArrowDown') {
        this.modeDepth = Math.max(0, this.modeDepth - 1)
        this.modeLevelChanged = true
        this.refreshModeTarget()
        return
      }
      if (event.key === 'Enter') {
        const candidate = this.modeCandidates[this.modeDepth]
        if (candidate) {
          this.hooks.onClip(candidate, this.modeLevelChanged)
          this.exitBlockMode()
        }
        return
      }
      if (event.key.toLowerCase() === 's') {
        const candidate = this.modeCandidates[this.modeDepth]
        if (candidate) {
          this.hooks.onScreenshot(candidate)
          this.exitBlockMode()
        }
      }
    }
    this.doc.addEventListener('keydown', onKey, true)
    this.modeOverlay = overlay
    this.modeKeyHandler = onKey
    this.modeStatusEl = status
    this.refreshModeTarget()
  }

  private modeDepth = 0
  private modeKeyHandler: ((event: KeyboardEvent) => void) | null = null
  private modeStatusEl: HTMLElement | null = null

  private refreshModeTarget(reposition = false): void {
    if (!this.modeActive) return
    void reposition
    const chain = candidatesAtPoint(this.lastPoint.x, this.lastPoint.y, this.doc)
    this.modeCandidates = chain
    this.modeDepth = Math.min(this.modeDepth, Math.max(0, chain.length - 1))
    const candidate = chain[this.modeDepth]
    this.outlineEl?.remove()
    if (!candidate) return
    const outline = this.doc.createElement('div')
    outline.setAttribute(ROOT_ATTR, 'block-outline')
    outline.className = 'ann-block-outline ann-block-outline-keyboard'
    const rect = candidate.element.getBoundingClientRect()
    Object.assign(outline.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    this.doc.documentElement.appendChild(outline)
    this.outlineEl = outline
    if (this.modeStatusEl) {
      const kind = uiText(`block.kind.${candidate.kind}` as 'block.kind.post')
      this.modeStatusEl.textContent = `${kind} · ${uiText('block.mode.hint')}`
    }
  }

  exitBlockMode(): void {
    if (this.modeKeyHandler) this.doc.removeEventListener('keydown', this.modeKeyHandler, true)
    this.modeKeyHandler = null
    this.modeOverlay?.remove()
    this.modeOverlay = null
    this.modeStatusEl?.remove()
    this.modeStatusEl = null
    this.outlineEl?.remove()
    this.outlineEl = null
    this.modeActive = false
    this.modeCandidates = []
    this.modeDepth = 0
  }

  isBlockModeActive(): boolean {
    return this.modeActive
  }
}

export type { BlockKind, BlockCandidate }
export { deepElementFromPoint }
