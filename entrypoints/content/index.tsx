import ReactDOM from 'react-dom/client'
import { useState, useEffect, useCallback } from 'react'
import HoverMenu from './HoverMenu'
import HighlighterCapsule from './HighlighterCapsule'
import modeManager from './mode-manager'
import { ClipService } from './clip-service'
import { HighlightService } from './highlight/service'
import { HighlightDOMManager } from './highlight/highlight-dom'
import CaptureModal from './capture/CaptureModal'
import { buildCaptureDraft, type CaptureDraft } from './capture/capture-context'
import MediaCaptureModal from './media/MediaCaptureModal'
import { detectMediaTargets, type MediaTarget } from './media/detect'
import ClipToast from './ClipToast'
import { enterScreenshotMode } from './screenshot'
import { SCREENSHOT_TRIGGER_GLOBAL } from '../../constants'
import MessageUtils from '../../utils/message'
import { Logger } from '../../utils/logger'
import type { HighlightRecord } from '../../types/highlight'
import type { HoverMenuAction } from '../../types/action'
import { uiText } from '../../utils/ui-text'
import './content.css'

// ── Constants ─────────────────────────────────────────────
const MIN_SELECTION_LENGTH = 2
const CONTINUOUS_MARK_COLOR = '#FFF8B4'

// ── Inject host-page styles (outside shadow DOM) ──────────
function injectHostStyles() {
  if (document.getElementById('ann-host-styles')) return
  const style = document.createElement('style')
  style.id = 'ann-host-styles'
  style.textContent = `
    @keyframes ann-clip-flash {
      0%   { background-color: #d4edda; }
      100% { background-color: transparent; }
    }
    .ann-clip-flash {
      animation: ann-clip-flash 0.3s ease forwards;
    }
    .ann-continuous-mark {
      background-color: ${CONTINUOUS_MARK_COLOR} !important;
      border-radius: 2px;
    }
    /* Marks the selection while the capture window is collapsed to the bottom bar (回到原文). */
    ::highlight(ann-capture-selection) {
      background-color: ${CONTINUOUS_MARK_COLOR};
      color: inherit;
    }
  `
  document.head.appendChild(style)
}

// ── Default hover menu actions (extensible) ───────────────
function getDefaultActions(): HoverMenuAction[] {
  // extension PRD §2.1: four actions, icon + short text, in this order; the
  // media clip is appended only on pages with a capturable <video>/<audio>.
  return [
    { id: 'save-fragment', label: uiText('menu.fragment'), icon: 'brain', hint: uiText('menu.fragment.hint'), order: 1, enabled: true, type: 'dialog' },
    { id: 'highlight', label: uiText('menu.highlight'), icon: 'highlighter', hint: uiText('menu.highlight.hint'), order: 2, enabled: true, type: 'expandable' },
    { id: 'clip', label: uiText('menu.clip'), icon: 'bookmark', hint: uiText('menu.clip.hint'), order: 3, enabled: true, type: 'dialog' },
    { id: 'screenshot', label: uiText('menu.screenshot'), icon: 'scan', hint: uiText('menu.screenshot.hint'), order: 4, enabled: true, type: 'dialog' },
    { id: 'save-media-clip', label: uiText('menu.mediaClip'), icon: 'film', hint: uiText('menu.mediaClip.hint'), order: 5, enabled: false, type: 'dialog' },
  ]
}

// ── Build the L1 capture draft (context fields) from a selection Range ──
function draftFromRange(range: Range): CaptureDraft {
  const container = range.commonAncestorContainer
  const fullText = container.textContent || ''
  const selected = range.toString()

  let start = 0
  let end = fullText.length
  if (container.nodeType === Node.TEXT_NODE) {
    start = range.startOffset
    end = range.endOffset
  } else {
    const idx = fullText.indexOf(selected)
    if (idx !== -1) {
      start = idx
      end = idx + selected.length
    }
  }

  let sourceUrl = window.location.href
  try {
    sourceUrl = HighlightDOMManager.findSourceUrl(range) || window.location.href
  } catch (err) {
    Logger.warn('[Selection] Failed to extract source URL:', err)
  }

  const draft = buildCaptureDraft({
    content: selected,
    containerText: fullText,
    selectionStart: start,
    selectionEnd: end,
    sourceUrl,
    sourceTitle: document.title,
  })
  // 网页载体默认带 DOM 定位符（capture.md §4/§6）：复用高亮链路的稳定
  // selector 规则；生成失败回落 none，不阻塞保存。
  try {
    const selector = HighlightDOMManager.generateSelector(range)
    if (selector && selector.length <= 2000) draft.locator = { type: 'dom', selector }
  } catch (err) {
    Logger.warn('[Selection] DOM locator generation failed, falling back to none:', err)
  }
  return draft
}

// ── Flash green feedback on the selected text ─────────────
function flashSelection(range: Range) {
  try {
    const span = document.createElement('span')
    span.className = 'ann-clip-flash'
    range.surroundContents(span)
    setTimeout(() => {
      const parent = span.parentNode
      if (parent) {
        while (span.firstChild) parent.insertBefore(span.firstChild, span)
        parent.removeChild(span)
      }
    }, 350)
  } catch {
    // surroundContents can fail on complex ranges; silently skip flash
  }
}

// ── Utility: is page ready ────────────────────────────────
function isPageReady(): boolean {
  return document.readyState === 'complete' || document.readyState === 'interactive'
}

function waitForPageReady(): Promise<void> {
  return new Promise(resolve => {
    if (isPageReady()) return resolve()
    const handler = () => {
      if (isPageReady()) {
        document.removeEventListener('readystatechange', handler)
        resolve()
      }
    }
    document.addEventListener('readystatechange', handler)
  })
}

// ══════════════════════════════════════════════════════════
// Main Selection component — orchestrates the hover menu and the continuous highlight mode
// ══════════════════════════════════════════════════════════
function Selection() {
  // ── Shared state ──
  const [highlightService] = useState(() => HighlightService.getInstance())
  const [clipService] = useState(() => ClipService.getInstance())
  const [isHighlighterMode, setIsHighlighterMode] = useState(false)

  // ── Hover menu state ──
  const [menuVisible, setMenuVisible] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; placement: 'above' | 'below' }>({ x: 0, y: 0, placement: 'above' })
  const [selectionRange, setSelectionRange] = useState<Range | null>(null)
  const [actions, setActions] = useState<HoverMenuAction[]>(getDefaultActions)

  // ── Continuous highlight mode state ──
  const [captureCount, setCaptureCount] = useState(0)

  // ── Chunk capture (L2 modal) state ──
  const [capture, setCapture] = useState<{ draft: CaptureDraft; range: Range | null; deepMode: boolean } | null>(null)

  // ── Media capture (R4.2) state ──
  const [mediaTargets, setMediaTargets] = useState<MediaTarget[] | null>(null)

  // ── Clip feedback toast: shows 已剪藏 with a ~3s undo window (extension.md §3.3) ──
  const [clipToast, setClipToast] = useState<{ id: string; failed: boolean } | null>(null)

  // ── Initialize services ──
  useEffect(() => {
    const init = async () => {
      try {
        await waitForPageReady()
        injectHostStyles()
        await highlightService.initialize()
        Logger.info('[Selection] Initialized successfully')
      } catch (error) {
        Logger.error('[Selection] Init failed:', error)
      }
    }
    init()
  }, [highlightService])

  // ── Sync mode manager with React state ──
  useEffect(() => {
    const unsub = modeManager.onModeChange(mode => {
      setIsHighlighterMode(mode)
      if (mode) {
        // Entering continuous highlight mode: reset the count, hide the hover menu
        setCaptureCount(0)
        setMenuVisible(false)
        setSelectionRange(null)
      }
    })
    return unsub
  }, [])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+H or Cmd+Shift+H → toggle the continuous highlight mode (extension.md §9)
      const isMac = (navigator as any).userAgentData?.platform?.toUpperCase()?.includes('MAC') ?? /mac/i.test(navigator.platform ?? '')
      if ((isMac && e.metaKey && e.shiftKey && e.key.toLowerCase() === 'h') || (!isMac && e.altKey && e.key.toLowerCase() === 'h')) {
        e.preventDefault()
        modeManager.toggle()
        return
      }
      // Esc → leave the continuous highlight mode (if active)
      if (e.key === 'Escape' && modeManager.getMode()) {
        modeManager.setMode(false)
        return
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Listen for TOGGLE_HIGHLIGHTER_MODE from the background ──
  useEffect(() => {
    const handler = (message: any) => {
      if (message.type === 'TOGGLE_HIGHLIGHTER_MODE') {
        modeManager.toggle()
      }
      if (message.type === 'LOCATE_HIGHLIGHT') {
        locateHighlight(message.data.highlightId)
          .then(() => {
            /* handled */
          })
          .catch(() => {
            /* silently fail */
          })
      }
      if (message.type === 'TRIGGER_SCREENSHOT') {
        enterScreenshotMode()
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  // ── Screenshot fallback trigger: when tabs.sendMessage has no receiver, the background runs a function in
  // this isolated world that calls this (command-handler.ts). A window CustomEvent would let the page start
  // a capture itself: the page's scripts can dispatch it too, an isolated-world global they cannot reach.
  useEffect(() => {
    const world = globalThis as Record<string, unknown>
    world[SCREENSHOT_TRIGGER_GLOBAL] = enterScreenshotMode
    return () => {
      delete world[SCREENSHOT_TRIGGER_GLOBAL]
    }
  }, [])

  // ── Calculate menu position near selection end ──
  // `y` is the menu's bottom edge when placed above the selection and its top edge when below, so the
  // consequence hint (which adds a line on the far side) never covers the selected text.
  const computeMenuPosition = useCallback((rect: DOMRect): { x: number; y: number; placement: 'above' | 'below' } => {
    const viewW = window.innerWidth
    const menuEstW = 360 // four icon+label actions (five on media pages)
    const menuRowH = 40

    let x = rect.right

    // Clamp horizontal
    if (x + menuEstW > viewW - 10) x = viewW - menuEstW - 10
    if (x < 10) x = 10

    // Prefer above; flip below if the row does not fit
    const above = rect.top - 8 - menuRowH >= 10
    return above ? { x, y: rect.top - 8, placement: 'above' } : { x, y: rect.bottom + 8, placement: 'below' }
  }, [])

  // ── Selection event handlers ──
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Ignore clicks inside our own UI — use composedPath() to
      // traverse shadow DOM boundaries (e.target is retargeted).
      const path = e.composedPath() as HTMLElement[]
      const insideAnnUI = path.some(el => el instanceof HTMLElement && el.hasAttribute?.('data-ann-ui'))
      if (insideAnnUI) return

      setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
          if (!isHighlighterMode) dismissMenu()
          return
        }

        const text = selection.toString().trim()
        if (text.length <= MIN_SELECTION_LENGTH) {
          if (!isHighlighterMode) dismissMenu()
          return
        }

        const range = selection.getRangeAt(0)
        if (range.collapsed) return

        if (isHighlighterMode) {
          // ── Continuous highlight mode: every selection becomes a highlight ──
          handleContinuousHighlight(range)
        } else {
          // ── Default: show the hover menu ──
          const rect = range.getBoundingClientRect()
          const pos = computeMenuPosition(rect)
          const media = detectMediaTargets()
          setMediaTargets(media)
          setActions(prev => prev.map(a => (a.id === 'save-media-clip' ? { ...a, enabled: media.length > 0 } : a)))
          setMenuPosition(pos)
          setSelectionRange(selection.getRangeAt(0))
          setMenuVisible(true)
        }
      }, 10)
    }

    // Debounce selectionchange to avoid dismissing the menu when a
    // click on a hover-menu button momentarily collapses the selection.
    let selectionTimer: ReturnType<typeof setTimeout> | null = null
    const handleSelectionChange = () => {
      if (selectionTimer) clearTimeout(selectionTimer)
      selectionTimer = setTimeout(() => {
        // If focus is inside our shadow DOM (activeElement is the shadow host),
        // don't dismiss. This allows clicking buttons or typing in inputs
        // without the menu disappearing due to selection collapse.
        if (document.activeElement?.tagName === 'ANN-SELECTION') {
          return
        }

        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
          // The continuous highlight mode has no menu to dismiss
          if (!isHighlighterMode) {
            if (!selection || selection.toString().trim().length <= MIN_SELECTION_LENGTH) {
              dismissMenu()
            }
          }
        }
      }, 200)
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('selectionchange', handleSelectionChange)
      if (selectionTimer) clearTimeout(selectionTimer)
    }
  }, [isHighlighterMode, computeMenuPosition])

  // ── Continuous highlight mode: a highlight per selection, nothing else (extension.md §9) ──
  const handleContinuousHighlight = useCallback(
    async (range: Range) => {
      try {
        const result = await highlightService.createHighlight(range.cloneRange(), CONTINUOUS_MARK_COLOR)
        if (result.success) {
          setCaptureCount(prev => prev + 1)
          // Clear the browser selection to prepare for the next one
          window.getSelection()?.removeAllRanges()
        }
      } catch (error) {
        Logger.error('[Selection] Continuous highlight failed:', error)
      }
    },
    [highlightService],
  )

  // ── Hover menu action dispatcher ──
  const handleAction = useCallback(
    async (actionId: string, extra?: { note?: string }) => {
      if (!selectionRange) return

      switch (actionId) {
        case 'save-fragment': {
          const rangeClone = selectionRange.cloneRange()
          const draft = draftFromRange(selectionRange)
          dismissMenu()
          window.getSelection()?.removeAllRanges()
          let deepMode = false
          try {
            const response = await MessageUtils.sendMessage({ type: 'GET_CAPTURE_CONFIG' })
            deepMode = !!(response.success && (response.data as { deepMode?: boolean })?.deepMode)
          } catch (err) {
            Logger.warn('[Selection] Failed to read capture config, defaulting to standard mode:', err)
          }
          setCapture({ draft, range: rangeClone, deepMode })
          break
        }
        case 'highlight': {
          // Highlight only: visual mark + optional note; never a Fragment (PRD §3.2).
          const rangeCopy = selectionRange.cloneRange()
          await highlightService.createHighlight(rangeCopy, '#ffeb3b', extra?.note)
          flashSelection(rangeCopy)
          window.getSelection()?.removeAllRanges()
          dismissMenu()
          break
        }
        case 'clip': {
          // Clip only: fast save, no processing, no highlight (PRD §3.3).
          const clip = await clipService.captureSelection(selectionRange)
          if (clip) flashSelection(selectionRange.cloneRange())
          setClipToast({ id: clip?.id ?? '', failed: !clip })
          window.getSelection()?.removeAllRanges()
          dismissMenu()
          break
        }
        case 'screenshot': {
          dismissMenu()
          window.getSelection()?.removeAllRanges()
          enterScreenshotMode()
          break
        }
        case 'save-media-clip': {
          const media = mediaTargets ?? detectMediaTargets()
          dismissMenu()
          window.getSelection()?.removeAllRanges()
          if (media.length > 0) setMediaTargets(media)
          break
        }
        default: {
          Logger.info(`[Selection] Unknown action: ${actionId}`)
        }
      }
    },
    [selectionRange, clipService, highlightService],
  )

  // ── Dismiss hover menu ──
  const dismissMenu = useCallback(() => {
    setMenuVisible(false)
    setSelectionRange(null)
  }, [])

  // Esc closes the bare hover menu (PRD §9); the capture modal and the
  // note input stop propagation first, so this never fights them.
  useEffect(() => {
    if (!menuVisible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modeManager.getMode()) dismissMenu()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuVisible, dismissMenu])

  // ── Handle blank click dismiss ──
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Use composedPath() to traverse through shadow DOM boundaries.
      // e.target is retargeted to the shadow host when the event crosses
      // the shadow boundary, so closest('[data-ann-ui]') would fail.
      const path = e.composedPath() as HTMLElement[]
      const insideAnnUI = path.some(el => el instanceof HTMLElement && el.hasAttribute?.('data-ann-ui'))
      if (insideAnnUI) return
      if (menuVisible) {
        dismissMenu()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuVisible, dismissMenu])

  return (
    <>
      {/* Hover menu */}
      {menuVisible && selectionRange && !isHighlighterMode && (
        <div data-ann-ui="hover-menu" style={{ pointerEvents: 'auto' }}>
          <HoverMenu position={menuPosition} selectedRange={selectionRange} actions={actions} onAction={handleAction} onDismiss={dismissMenu} />
        </div>
      )}

      {/* Continuous highlight mode: status capsule */}
      {isHighlighterMode && (
        <div data-ann-ui="capsule" style={{ pointerEvents: 'auto' }}>
          <HighlighterCapsule captureCount={captureCount} onExit={() => modeManager.setMode(false)} />
        </div>
      )}

      {/* Clip toast: 已剪藏, undo within ~3s */}
      {clipToast && (
        <div data-ann-ui="clip-toast-wrapper" style={{ pointerEvents: 'auto' }}>
          <ClipToast key={clipToast.id} clipId={clipToast.id} failed={clipToast.failed} onUndo={id => clipService.deleteClip(id)} onDone={() => setClipToast(null)} />
        </div>
      )}

      {/* R4.2 media-clip capture modal */}
      {mediaTargets && mediaTargets.length > 0 && (
        <div data-ann-ui="media-capture-wrapper" style={{ pointerEvents: 'auto' }}>
          <MediaCaptureModal targets={mediaTargets} sourceUrl={window.location.href} sourceTitle={document.title} onClose={() => setMediaTargets(null)} />
        </div>
      )}

      {/* L2 capture modal */}
      {capture && (
        <div data-ann-ui="capture-modal-wrapper" style={{ pointerEvents: 'auto' }}>
          <CaptureModal
            draft={capture.draft}
            deepMode={capture.deepMode}
            selectedRange={capture.range}
            createHighlight={async range => {
              const result = await highlightService.createHighlight(range)
              return result.success && result.data ? result.data.id : null
            }}
            fallbacks={{
              highlight: async (range, note) => (await highlightService.createHighlight(range, '#ffeb3b', note || undefined)).success,
              clip: async (range, note) => (await clipService.captureSelection(range, note || undefined)) !== null,
            }}
            onClose={() => setCapture(null)}
          />
        </div>
      )}
    </>
  )
}

// ── Locate highlight (kept from original) ──
async function locateHighlight(highlightId: string) {
  try {
    const response = await MessageUtils.sendMessage({
      type: 'GET_HIGHLIGHTS',
      query: { id: highlightId },
    })
    if (!response.success) throw new Error(response.error || 'Failed to get highlights')

    const highlight = response.data as HighlightRecord
    if (!highlight) throw new Error('Highlight not found')
    if (highlight.url !== window.location.href) throw new Error('Not on current page')

    const element = document.querySelector(highlight.selector) as HTMLElement
    if (!element) throw new Error('Could not locate highlight element')

    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })

    const originalStyle = element.style.cssText
    element.style.cssText += `
      background-color: ${highlight.color} !important;
      animation: highlight-pulse 2s ease-in-out;
    `

    if (!document.getElementById('highlight-pulse-style')) {
      const style = document.createElement('style')
      style.id = 'highlight-pulse-style'
      style.textContent = `
        @keyframes highlight-pulse {
          0% { box-shadow: 0 0 0 0 ${highlight.color}80; }
          50% { box-shadow: 0 0 0 10px ${highlight.color}40; }
          100% { box-shadow: 0 0 0 0 ${highlight.color}00; }
        }
      `
      document.head.appendChild(style)
    }

    setTimeout(() => {
      element.style.cssText = originalStyle
    }, 2000)

    return { success: true, message: 'Highlight located' }
  } catch (error) {
    Logger.error('[Content Script] Locate highlight failed:', error)
    throw error
  }
}

// ══════════════════════════════════════════════════════════
// WXT content script entry point
// ══════════════════════════════════════════════════════════
export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'ann-selection',
      position: 'overlay',
      anchor: 'html',
      onMount: container => {
        // Overlay covers viewport but shouldn't block page interactions;
        // our fixed-position children use pointer-events: auto.
        container.style.pointerEvents = 'none'
        const app = document.createElement('div')
        app.style.pointerEvents = 'none'
        container.append(app)
        const root = ReactDOM.createRoot(app)
        root.render(<Selection />)
        return root
      },
      onRemove: root => {
        root?.unmount()
      },
    })
    ui.mount()
  },
})
