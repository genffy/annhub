/**
 * The keyboard block mode (docs/product/capture.md §6.2 区块模式): the same
 * content chain the hover capsule reads, driven by keys. Tab / Shift+Tab move
 * between the targets of the same tier, ↑ / ↓ climb the chain's levels (the
 * hover capsule has no level buttons), ↓ at the innermost level enters the
 * target inside, Enter clips, S screenshots, D downloads, Esc exits.
 */
import { isUserInput } from './user-input'
import { uiText } from '../../utils/ui-text'
import { candidateAnchor, sameCandidate, type BlockCandidate } from './blocks'
import { chainAtPoint, chainForElement, chainHolding, childChainOf, firstVisibleChain, isSuppressed, layerStatus, peersOf, startIndexOf } from './target-chain'
import { paintOutline, placeLabel } from './block-hover'

const ROOT_ATTR = 'data-ann-ui'

export interface BlockModeHooks {
  onClip(candidate: BlockCandidate, levelChanged: boolean): void
  onScreenshot?(candidate: BlockCandidate): void
  onDownload?(candidate: BlockCandidate): void
}

export class BlockMode {
  active = false
  private chain: BlockCandidate[] = []
  private depth = 0
  private levelChanged = false
  private painted: BlockCandidate | null = null
  private overlayEl: HTMLElement | null = null
  private statusEl: HTMLElement | null = null
  private kindEl: HTMLElement | null = null
  private hintEl: HTMLElement | null = null
  private outlineEl: HTMLElement | null = null
  private labelEl: HTMLElement | null = null
  private keyHandler: ((event: KeyboardEvent) => void) | null = null
  private repaint: (() => void) | null = null
  private restoreFocus: HTMLElement | null = null
  private lastPoint = { x: 0, y: 0 }
  /** The start the pointer last brought the mode to: the level the user chose stays while the pointer moves inside it. */
  private pointerStart: BlockCandidate | null = null

  constructor(
    private readonly doc: Document,
    private readonly hooks: BlockModeHooks,
    private readonly onHideHover: () => void,
  ) {}

  enter(): void {
    if (this.active) {
      this.exit()
      return
    }
    this.onHideHover()
    // The first target comes from where the user is — the focused element, else the first start on
    // screen (capture.md §6.2) — and is found before the overlay exists, so hit-testing sees the page.
    const initial = this.initialChain()
    this.active = true
    this.levelChanged = false
    this.chain = []
    this.depth = 0
    this.painted = null
    this.pointerStart = initial.length > 0 ? initial[startIndexOf(initial)]! : null

    const overlay = this.doc.createElement('div')
    overlay.setAttribute(ROOT_ATTR, 'block-mode-overlay')
    overlay.className = 'ann-block-mode-overlay'
    // One live region: the kind and the unit's own words change with the target; the key hint
    // never changes, so it is announced once with the mode and not on every move. The "Block
    // mode" prefix is presentation — aria-hidden keeps the announcement at "kind · summary".
    const status = this.doc.createElement('div')
    status.className = 'ann-block-mode-status'
    status.setAttribute(ROOT_ATTR, 'block-mode-capsule')
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    status.setAttribute('aria-atomic', 'false')
    const dot = this.doc.createElement('i')
    dot.className = 'ann-block-mode-dot'
    const label = this.doc.createElement('span')
    label.className = 'ann-block-mode-label'
    label.setAttribute('aria-hidden', 'true')
    label.textContent = uiText('block.mode.label') + ' ·'
    const kind = this.doc.createElement('span')
    kind.className = 'ann-block-mode-kind'
    const hint = this.doc.createElement('span')
    hint.className = 'ann-block-mode-hint'
    type HintPart = [keys: string[], labelKey: 'block.mode.next' | 'block.mode.level' | 'block.clip' | 'block.shot' | 'block.download' | 'block.mode.exit', act: boolean]
    const hintParts: HintPart[] = [
      [['Tab'], 'block.mode.next', false],
      [['↑', '↓'], 'block.mode.level', false],
      [['Enter'], 'block.clip', true],
    ]
    if (this.hooks.onScreenshot) hintParts.push([['S'], 'block.shot', true])
    if (this.hooks.onDownload) hintParts.push([['D'], 'block.download', true])
    hintParts.push([['Esc'], 'block.mode.exit', true])
    for (const [keys, labelKey, act] of hintParts) {
      for (const key of keys) {
        const cap = this.doc.createElement('kbd')
        cap.textContent = key
        hint.appendChild(cap)
      }
      const words = this.doc.createElement('span')
      if (act) words.className = 'ann-block-mode-act'
      words.textContent = uiText(labelKey)
      hint.appendChild(words)
    }
    // the address bar holds the keys while the page has no focus: Esc would land in the browser
    this.hintEl = hint
    if (!this.doc.hasFocus()) {
      const note = this.doc.createElement('span')
      note.className = 'ann-block-mode-nofocus'
      note.textContent = uiText('page.noFocus')
      hint.appendChild(note)
    }
    status.append(dot, label, kind, hint)
    this.doc.documentElement.append(overlay, status)
    this.doc.addEventListener('focus', this.modeOnFocus, true)
    // Keys must reach this document: a user whose focus sat in a child frame would otherwise type
    // into that frame while the mode waits here. The previous focus comes back on exit.
    const previousFocus = this.doc.activeElement
    this.restoreFocus = previousFocus instanceof HTMLElement && previousFocus !== this.doc.body ? previousFocus : null
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
      if (!this.active) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        this.exit()
        return
      }
      if (event.key === 'Tab') {
        this.moveToPeer(event.shiftKey ? -1 : 1)
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        // the chain stays what it was: ↓ walks back down the same chain ↑ walked up
        const next = this.depth + (event.key === 'ArrowUp' ? 1 : -1)
        if (next >= 0 && next < this.chain.length) {
          this.levelChanged = true
          this.depth = next
          this.paintMode(true)
          return
        }
        // ↓ at the innermost level enters the target inside, one level at a time: an
        // article enters the section the window is in, other targets their first start.
        // The child chain is spliced in front, so the next ↓ goes on down it and
        // ↑ walks back out the way ↓ came in.
        if (event.key === 'ArrowDown' && this.depth === 0) {
          const current = this.chain[this.depth]
          if (!current) return
          const inner = childChainOf(current, this.doc).filter(candidate => !this.chain.some(existing => sameCandidate(existing, candidate)))
          if (inner.length === 0) return
          this.levelChanged = true
          this.chain = [...inner, ...this.chain]
          this.depth = inner.length - 1
          this.paintMode(true)
        }
        return
      }
      if (event.key === 'Enter') {
        const candidate = this.chain[this.depth]
        if (candidate) {
          this.hooks.onClip(candidate, this.levelChanged)
          this.exit()
        }
        return
      }
      if (event.key.toLowerCase() === 's' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const candidate = this.chain[this.depth]
        if (candidate && this.hooks.onScreenshot) {
          this.hooks.onScreenshot(candidate)
          this.exit()
        }
        return
      }
      if (event.key.toLowerCase() === 'd' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const candidate = this.chain[this.depth]
        if (candidate && this.hooks.onDownload) {
          this.hooks.onDownload(candidate)
          this.exit()
        }
      }
    }
    this.doc.addEventListener('keydown', onKey, true)
    // the outline is fixed to the window: a page that scrolls under it needs it repainted
    const repaint = (): void => this.paintMode(false, true)
    this.doc.addEventListener('scroll', repaint, true)
    this.doc.defaultView?.addEventListener('resize', repaint)
    this.repaint = repaint
    this.overlayEl = overlay
    this.keyHandler = onKey
    this.statusEl = status
    this.kindEl = kind
    if (initial.length > 0) this.setChain(initial, startIndexOf(initial), true)
  }

  private initialChain(): BlockCandidate[] {
    const focused = this.doc.activeElement
    if (focused instanceof Element && focused !== this.doc.body && focused !== this.doc.documentElement) {
      const chain = chainForElement(focused, this.doc)
      if (chain.length > 0 && !isSuppressed(chain, startIndexOf(chain))) return chain
    }
    return firstVisibleChain(this.doc)
  }

  /** A new target replaces the chain; the depth the user chose is kept as far as the new chain reaches. */
  private setChain(chain: BlockCandidate[], depth: number, scroll: boolean): void {
    this.chain = chain
    this.depth = Math.max(0, Math.min(depth, chain.length - 1))
    this.paintMode(scroll)
  }

  private refreshFromPointer(): void {
    if (!this.active) return
    // hit-test through the mode overlay: it sits on top of the page by design
    if (this.overlayEl) this.overlayEl.style.pointerEvents = 'none'
    const chain = chainAtPoint(this.lastPoint.x, this.lastPoint.y, this.doc)
    if (this.overlayEl) this.overlayEl.style.pointerEvents = ''
    // nothing under the pointer or a paused region: the previous target stays, outlined, so what is painted is what Enter saves
    if (chain.length === 0 || isSuppressed(chain, startIndexOf(chain))) return
    const start = startIndexOf(chain)
    // only a new start brings the level back to the start (capture.md §6.2 起点): a hand that drifts
    // inside the same start keeps the ↑ ↓ the user pressed, and the Tab target they moved to
    if (this.pointerStart && sameCandidate(this.pointerStart, chain[start]!)) return
    this.pointerStart = chain[start]!
    this.setChain(chain, start, false)
  }

  /** Tab / Shift+Tab: the next or previous target of the same tier, in document order, wrapping around. */
  private moveToPeer(step: 1 | -1): void {
    const current = this.chain[this.depth]
    if (!current) return
    const peers = peersOf(current, this.doc)
    if (peers.length < 2) return
    const index = peers.findIndex(peer => sameCandidate(peer, current))
    const next = peers[(index + step + peers.length) % peers.length]!
    // the chain is detected from the target itself, so ↑↓ keep working from the new position
    const chain = chainHolding(next, this.doc)
    const depth = chain.findIndex(candidate => sameCandidate(candidate, next))
    this.setChain(depth >= 0 ? chain : [next], Math.max(depth, 0), true)
  }

  /** Outlines the current target and says what it is; scroll brings it into view (keyboard moves only). */
  private paintMode(scroll: boolean, force = false): void {
    const candidate = this.chain[this.depth]
    if (!candidate) return
    if (!force && !scroll && this.painted && sameCandidate(this.painted, candidate)) return
    this.painted = candidate
    if (scroll) candidateAnchor(candidate).scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
    this.outlineEl?.remove()
    this.labelEl?.remove()
    const painted = paintOutline(this.doc, candidate, true)
    this.outlineEl = painted.outline
    this.labelEl = painted.label
    placeLabel(this.doc, this.labelEl, candidate, null)
    if (this.kindEl) {
      const text = layerStatus(candidate)
      if (this.kindEl.textContent !== text) this.kindEl.textContent = text
    }
  }

  private readonly modeOnFocus = (): void => {
    if (!this.hintEl) return
    const note = this.hintEl.querySelector('.ann-block-mode-nofocus')
    if (this.doc.hasFocus()) note?.remove()
    else if (!note) {
      const added = this.doc.createElement('span')
      added.className = 'ann-block-mode-nofocus'
      added.textContent = uiText('page.noFocus')
      this.hintEl.appendChild(added)
    }
  }

  exit(): void {
    if (this.keyHandler) this.doc.removeEventListener('keydown', this.keyHandler, true)
    this.doc.removeEventListener('focus', this.modeOnFocus, true)
    if (this.repaint) {
      this.doc.removeEventListener('scroll', this.repaint, true)
      this.doc.defaultView?.removeEventListener('resize', this.repaint)
    }
    this.keyHandler = null
    this.repaint = null
    const restoreFocus = this.restoreFocus
    this.restoreFocus = null
    this.overlayEl?.remove()
    this.overlayEl = null
    this.statusEl?.remove()
    this.statusEl = null
    this.kindEl = null
    this.hintEl = null
    this.outlineEl?.remove()
    this.outlineEl = null
    this.labelEl?.remove()
    this.labelEl = null
    this.active = false
    this.chain = []
    this.painted = null
    this.depth = 0
    this.pointerStart = null
    if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true })
  }

  dispose(): void {
    this.exit()
  }
}
