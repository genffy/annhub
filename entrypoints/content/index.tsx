import ReactDOM from 'react-dom/client'
import { useState, useEffect, useCallback } from 'react'
import HoverMenu from './HoverMenu'
import HighlighterCapsule from './HighlighterCapsule'
import modeManager from './mode-manager'
import { ClipService } from './clip-service'
import { HighlightService } from './highlight/service'
import MessageUtils from '../../utils/message'
import { HighlightRecord } from '../../types/highlight'
import type { HoverMenuAction } from '../../types/action'
import './content.css'

// ── Constants ─────────────────────────────────────────────
const MIN_SELECTION_LENGTH = 2
const MODE_B_MARK_COLOR = '#FFF8B4'

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
    .ann-mode-b-mark {
      background-color: ${MODE_B_MARK_COLOR} !important;
      border-radius: 2px;
    }
  `
  document.head.appendChild(style)
}

// ── Default hover menu actions (extensible) ───────────────
function getDefaultActions(): HoverMenuAction[] {
  return [
    {
      id: 'direct-collect',
      label: '采集',
      icon: '🎯',
      desc: '直接采集选中文本',
      order: 1,
      enabled: true,
      type: 'instant',
    },
    {
      id: 'add-note',
      label: '备注',
      icon: '💬',
      desc: '添加备注后保存',
      order: 2,
      enabled: true,
      type: 'expandable',
    },
    {
      id: 'enter-highlighter',
      label: '荧光笔',
      icon: '🖍️',
      desc: '开启荧光笔模式 (Alt+H)',
      order: 3,
      enabled: true,
      type: 'toggle',
    },
  ]
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
// Main Selection component — orchestrates Mode A & Mode B
// ══════════════════════════════════════════════════════════
function Selection() {
  // ── Shared state ──
  const [highlightService] = useState(() => HighlightService.getInstance())
  const [clipService] = useState(() => ClipService.getInstance())
  const [isHighlighterMode, setIsHighlighterMode] = useState(false)

  // ── Mode A state ──
  const [menuVisible, setMenuVisible] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [selectionRange, setSelectionRange] = useState<Range | null>(null)
  const [actions] = useState<HoverMenuAction[]>(getDefaultActions)

  // ── Mode B state ──
  const [captureCount, setCaptureCount] = useState(0)

  // ── Initialize services ──
  useEffect(() => {
    const init = async () => {
      try {
        await waitForPageReady()
        injectHostStyles()
        await highlightService.initialize()
        console.log('[Selection] Initialized successfully')
      } catch (error) {
        console.error('[Selection] Init failed:', error)
      }
    }
    init()
  }, [highlightService])

  // ── Sync mode manager with React state ──
  useEffect(() => {
    const unsub = modeManager.onModeChange(mode => {
      setIsHighlighterMode(mode)
      if (mode) {
        // Entering Mode B: reset capture count, hide hover menu
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
      // Alt+H or Cmd+Shift+H → toggle Mode B
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      if (
        (isMac && e.metaKey && e.shiftKey && e.key.toLowerCase() === 'h') ||
        (!isMac && e.altKey && e.key.toLowerCase() === 'h')
      ) {
        e.preventDefault()
        modeManager.toggle()
        return
      }
      // Esc → exit Mode B (if active)
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
          .then(() => {/* handled */ })
          .catch(() => {/* silently fail */ })
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  // ── Calculate menu position near selection end ──
  const computeMenuPosition = useCallback((rect: DOMRect): { x: number; y: number } => {
    const viewW = window.innerWidth
    const menuEstW = 220
    const menuEstH = 40

    let x = rect.right
    let y = rect.top - menuEstH - 8 // prefer above

    // Clamp horizontal
    if (x + menuEstW > viewW - 10) x = viewW - menuEstW - 10
    if (x < 10) x = 10

    // Flip below if no room above
    if (y < 10) y = rect.bottom + 8

    return { x, y }
  }, [])

  // ── Selection event handlers ──
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Ignore clicks inside our own UI — use composedPath() to
      // traverse shadow DOM boundaries (e.target is retargeted).
      const path = e.composedPath() as HTMLElement[]
      const insideAnnUI = path.some(
        el => el instanceof HTMLElement && el.hasAttribute?.('data-ann-ui')
      )
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
          // ── Mode B: silent capture ──
          handleModeBCapture(range)
        } else {
          // ── Mode A: show hover menu ──
          const rect = range.getBoundingClientRect()
          const pos = computeMenuPosition(rect)
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
          // Don't auto-hide in Mode B
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

  // ── Mode B capture handler ──
  const handleModeBCapture = useCallback(
    async (range: Range) => {
      try {
        const rangeCopy = range.cloneRange()
        const clip = await clipService.captureSelection(range, 'Mode B')
        if (clip) {
          // Persist highlight to IndexedDB + apply DOM <mark>
          await highlightService.createHighlight(rangeCopy, MODE_B_MARK_COLOR)
          setCaptureCount(prev => prev + 1)
          // Clear browser selection to prepare for next
          window.getSelection()?.removeAllRanges()
        }
      } catch (error) {
        console.error('[Selection] Mode B capture failed:', error)
      }
    },
    [clipService, highlightService]
  )

  // ── Mode A action dispatcher ──
  const handleAction = useCallback(
    async (actionId: string, extra?: { note?: string }) => {
      if (!selectionRange) return

      switch (actionId) {
        case 'direct-collect': {
          const rangeCopy = selectionRange.cloneRange()
          const clip = await clipService.captureSelection(selectionRange, 'Mode A')
          if (clip) {
            // Persist highlight to IndexedDB + apply DOM <mark>
            await highlightService.createHighlight(rangeCopy)
            flashSelection(rangeCopy)
          }
          window.getSelection()?.removeAllRanges()
          break
        }
        case 'add-note': {
          const rangeCopy = selectionRange.cloneRange()
          const clip = await clipService.captureSelection(
            selectionRange,
            'Mode A',
            extra?.note
          )
          if (clip) {
            // Persist highlight to IndexedDB + apply DOM <mark>
            await highlightService.createHighlight(rangeCopy, '#ffeb3b', extra?.note)
            flashSelection(rangeCopy)
          }
          window.getSelection()?.removeAllRanges()
          break
        }
        case 'enter-highlighter': {
          modeManager.setMode(true)
          window.getSelection()?.removeAllRanges()
          break
        }
        default: {
          console.log(`[Selection] Unknown action: ${actionId}`)
        }
      }
    },
    [selectionRange, clipService, highlightService]
  )

  // ── Dismiss hover menu ──
  const dismissMenu = useCallback(() => {
    setMenuVisible(false)
    setSelectionRange(null)
  }, [])

  // ── Handle blank click dismiss ──
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Use composedPath() to traverse through shadow DOM boundaries.
      // e.target is retargeted to the shadow host when the event crosses
      // the shadow boundary, so closest('[data-ann-ui]') would fail.
      const path = e.composedPath() as HTMLElement[]
      const insideAnnUI = path.some(
        el => el instanceof HTMLElement && el.hasAttribute?.('data-ann-ui')
      )
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
      {/* Mode A: Hover Menu */}
      {menuVisible && selectionRange && !isHighlighterMode && (
        <div data-ann-ui="hover-menu" style={{ pointerEvents: 'auto' }}>
          <HoverMenu
            position={menuPosition}
            selectedRange={selectionRange}
            actions={actions}
            onAction={handleAction}
            onDismiss={dismissMenu}
          />
        </div>
      )}

      {/* Mode B: Highlighter Capsule */}
      {isHighlighterMode && (
        <div data-ann-ui="capsule" style={{ pointerEvents: 'auto' }}>
          <HighlighterCapsule
            captureCount={captureCount}
            onExit={() => modeManager.setMode(false)}
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
    console.error('[Content Script] Locate highlight failed:', error)
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
