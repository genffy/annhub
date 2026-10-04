/**
 * HoverMenu — the selection menu of Mode A (extension.md §2.1).
 *
 * Each action is icon + short text. Hovering or keyboard-focusing an action
 * for ~300ms shows its consequence hint ("time · output · enters review?"),
 * so the three save paths differ at the entrance.
 *
 * Action types:
 *   - 'expandable': reveals inline UI on click (Highlight's optional note)
 *   - 'toggle':     enters a different mode; the parent owns dismissal
 *   - 'dialog':     opens a dialog, toast or capture session; the parent owns dismissal
 *
 * The component manages:
 *   - 20px invisible safe-padding zone around the menu
 *   - 800ms debounced dismissal on mouse-leave
 *   - Flash feedback (✅) after an expandable action is submitted
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { Bookmark, Brain, Film, Highlighter, Scan, type LucideIcon } from 'lucide-react'
import type { HoverMenuAction, HoverMenuIcon } from '../../types/action'
import { uiText } from '../../utils/ui-text'

export interface HoverMenuProps {
  /**
   * Pixel position (fixed). `y` is the bottom edge when `placement` is 'above' the selection
   * and the top edge when 'below', so growth (the hint line) happens away from the selection.
   */
  position: { x: number; y: number; placement: 'above' | 'below' }
  /** Currently selected Range for context */
  selectedRange: Range
  /** Ordered list of enabled actions */
  actions: HoverMenuAction[]
  /** Called when an action fires. The action id is passed. */
  onAction: (actionId: string, extra?: { note?: string }) => void
  /** Called when the menu should be dismissed */
  onDismiss: () => void
}

const SAFE_PADDING = 20
const DISMISS_DELAY = 800 // ms
const HINT_DELAY = 300 // ms

const ICONS: Record<HoverMenuIcon, LucideIcon> = {
  brain: Brain,
  highlighter: Highlighter,
  bookmark: Bookmark,
  scan: Scan,
  film: Film,
}

export default function HoverMenu({ position, selectedRange: _selectedRange, actions, onAction, onDismiss }: HoverMenuProps) {
  const [expandedAction, setExpandedAction] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [hintActionId, setHintActionId] = useState<string | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when note expands
  useEffect(() => {
    if (expandedAction && inputRef.current) {
      inputRef.current.focus()
    }
  }, [expandedAction])

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      if (hintTimer.current) clearTimeout(hintTimer.current)
    }
  }, [])

  const startDismissTimer = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    dismissTimer.current = setTimeout(() => {
      onDismiss()
    }, DISMISS_DELAY)
  }, [onDismiss])

  const cancelDismissTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }, [])

  const scheduleHint = useCallback((actionId: string) => {
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintActionId(actionId), HINT_DELAY)
  }, [])

  const cancelHint = useCallback(() => {
    if (hintTimer.current) {
      clearTimeout(hintTimer.current)
      hintTimer.current = null
    }
    setHintActionId(null)
  }, [])

  const handleMouseEnter = useCallback(() => {
    cancelDismissTimer()
  }, [cancelDismissTimer])

  const handleMouseLeave = useCallback(() => {
    startDismissTimer()
    cancelHint()
  }, [startDismissTimer, cancelHint])

  const flashAndDismiss = useCallback(() => {
    setShowSuccess(true)
    setTimeout(() => {
      setShowSuccess(false)
      onDismiss()
    }, 600)
  }, [onDismiss])

  const handleActionClick = useCallback(
    (action: HoverMenuAction) => {
      cancelHint()
      if (action.type === 'expandable') {
        setExpandedAction(prev => (prev === action.id ? null : action.id))
        return
      }
      // 'toggle' | 'dialog' — the parent owns dismissal
      onAction(action.id)
    },
    [onAction, cancelHint],
  )

  // The note is optional (extension.md §3.2): submitting an empty field still creates the highlight.
  const handleNoteSubmit = useCallback(() => {
    onAction(expandedAction!, { note: noteText.trim() || undefined })
    setNoteText('')
    setExpandedAction(null)
    flashAndDismiss()
  }, [noteText, expandedAction, onAction, flashAndDismiss])

  const handleNoteKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleNoteSubmit()
      }
      if (e.key === 'Escape') {
        setExpandedAction(null)
      }
    },
    [handleNoteSubmit],
  )

  const sorted = [...actions].filter(a => a.enabled).sort((a, b) => a.order - b.order)
  const hintAction = sorted.find(a => a.id === hintActionId)

  const above = position.placement === 'above'
  const anchor: React.CSSProperties = above ? { bottom: `${window.innerHeight - position.y - SAFE_PADDING}px` } : { top: `${position.y - SAFE_PADDING}px` }

  if (showSuccess) {
    return (
      <div
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${above ? position.y - 44 : position.y}px`,
          zIndex: 999999,
          padding: `${SAFE_PADDING}px`,
        }}
      >
        <div
          style={{
            background: 'rgba(40, 167, 69, 0.95)',
            color: '#fff',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '18px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            animation: 'ann-hover-fadein 0.15s ease',
          }}
        >
          ✅
        </div>
      </div>
    )
  }

  return (
    <div
      ref={menuRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'fixed',
        left: `${position.x - SAFE_PADDING}px`,
        ...anchor,
        zIndex: 999999,
        padding: `${SAFE_PADDING}px`,
      }}
    >
      <div
        style={{
          display: 'flex',
          // Above the selection the hint sits on top of the row, so the row never moves when it appears.
          flexDirection: above ? 'column-reverse' : 'column',
          gap: '0px',
          background: 'rgba(30, 30, 30, 0.96)',
          borderRadius: '10px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '14px',
          userSelect: 'none',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
          animation: 'ann-hover-fadein 0.15s ease',
        }}
      >
        {/* Action buttons row */}
        <div style={{ display: 'flex', gap: '0px' }} role="toolbar">
          {sorted.map((action, idx) => {
            const Icon = ICONS[action.icon]
            return (
              <button
                key={action.id}
                onClick={() => handleActionClick(action)}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'
                  scheduleHint(action.id)
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                  cancelHint()
                }}
                onFocus={() => scheduleHint(action.id)}
                onBlur={cancelHint}
                aria-describedby={hintActionId === action.id ? 'ann-hover-hint' : undefined}
                data-testid={`hover-action-${action.id}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#e0e0e0',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  transition: 'background 0.15s',
                  borderRight: idx < sorted.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={15} strokeWidth={2} aria-hidden="true" />
                <span style={{ fontSize: '12px' }}>{action.label}</span>
              </button>
            )
          })}
        </div>

        {/* Consequence hint: time · output · enters review? */}
        {hintAction && (
          <div
            id="ann-hover-hint"
            role="status"
            data-testid="hover-hint"
            style={{
              padding: '6px 12px',
              [above ? 'borderBottom' : 'borderTop']: '1px solid rgba(255,255,255,0.08)',
              color: '#c8c8d0',
              fontSize: '12px',
              lineHeight: 1.5,
              // Wrap inside the action row instead of widening the menu.
              width: 0,
              minWidth: '100%',
            }}
          >
            {hintAction.hint}
          </div>
        )}

        {/* Expandable note input */}
        {expandedAction && (
          <div
            style={{
              display: 'flex',
              padding: '6px 8px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              gap: '6px',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={handleNoteKeyDown}
              placeholder={uiText('menu.notePlaceholder')}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px',
                padding: '5px 8px',
                color: '#e0e0e0',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleNoteSubmit}
              style={{
                background: 'rgba(40, 167, 69, 0.85)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                padding: '5px 10px',
                cursor: 'pointer',
                fontSize: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              ↵
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
