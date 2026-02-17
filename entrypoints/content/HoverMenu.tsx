/**
 * HoverMenu — minimal popup menu for Mode A (sniper mode).
 *
 * Renders an extensible set of actions driven by the `actions` prop.
 * Built-in action types:
 *   - 'instant':    single-click fire-and-forget (e.g. Direct Collect)
 *   - 'expandable': reveals inline UI on click (e.g. Add Note)
 *   - 'toggle':     enters a different mode (e.g. Highlighter)
 *
 * The component manages:
 *   - 20px invisible safe-padding zone around the menu
 *   - 800ms debounced dismissal on mouse-leave
 *   - Flash feedback (✅) after instant actions
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import type { HoverMenuAction } from '../../types/action'

export interface HoverMenuProps {
    /** Pixel position (fixed) for the menu */
    position: { x: number; y: number }
    /** Currently selected Range for context */
    selectedRange: Range
    /** Ordered list of enabled actions */
    actions: HoverMenuAction[]
    /** Called when an instant action fires. The action id is passed. */
    onAction: (actionId: string, extra?: { note?: string }) => void
    /** Called when the menu should be dismissed */
    onDismiss: () => void
}

const SAFE_PADDING = 20
const DISMISS_DELAY = 800 // ms

export default function HoverMenu({
    position,
    selectedRange: _selectedRange,
    actions,
    onAction,
    onDismiss,
}: HoverMenuProps) {
    const [expandedAction, setExpandedAction] = useState<string | null>(null)
    const [noteText, setNoteText] = useState('')
    const [showSuccess, setShowSuccess] = useState(false)
    const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Focus input when note expands
    useEffect(() => {
        if (expandedAction === 'add-note' && inputRef.current) {
            inputRef.current.focus()
        }
    }, [expandedAction])

    // Clear timer on unmount
    useEffect(() => {
        return () => {
            if (dismissTimer.current) clearTimeout(dismissTimer.current)
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

    const handleMouseEnter = useCallback(() => {
        cancelDismissTimer()
    }, [cancelDismissTimer])

    const handleMouseLeave = useCallback(() => {
        startDismissTimer()
    }, [startDismissTimer])

    const handleActionClick = useCallback(
        (action: HoverMenuAction) => {
            if (action.type === 'expandable') {
                setExpandedAction(prev => (prev === action.id ? null : action.id))
                return
            }
            // 'instant' or 'toggle'
            onAction(action.id)
            if (action.type === 'instant') {
                setShowSuccess(true)
                setTimeout(() => {
                    setShowSuccess(false)
                    onDismiss()
                }, 600)
            }
        },
        [onAction, onDismiss]
    )

    const handleNoteSubmit = useCallback(() => {
        if (noteText.trim()) {
            onAction('add-note', { note: noteText.trim() })
            setNoteText('')
            setExpandedAction(null)
            setShowSuccess(true)
            setTimeout(() => {
                setShowSuccess(false)
                onDismiss()
            }, 600)
        }
    }, [noteText, onAction, onDismiss])

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
        [handleNoteSubmit]
    )

    const sorted = [...actions].filter(a => a.enabled).sort((a, b) => a.order - b.order)

    if (showSuccess) {
        return (
            <div
                style={{
                    position: 'fixed',
                    left: `${position.x}px`,
                    top: `${position.y}px`,
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
                top: `${position.y - SAFE_PADDING}px`,
                zIndex: 999999,
                padding: `${SAFE_PADDING}px`,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
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
                <div style={{ display: 'flex', gap: '0px' }}>
                    {sorted.map((action, idx) => (
                        <button
                            key={action.id}
                            onClick={() => handleActionClick(action)}
                            title={action.desc}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#e0e0e0',
                                padding: '8px 14px',
                                cursor: 'pointer',
                                fontSize: '15px',
                                transition: 'background 0.15s',
                                borderRight:
                                    idx < sorted.length - 1
                                        ? '1px solid rgba(255,255,255,0.08)'
                                        : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => {
                                ; (e.currentTarget as HTMLElement).style.background =
                                    'rgba(255,255,255,0.1)'
                            }}
                            onMouseLeave={e => {
                                ; (e.currentTarget as HTMLElement).style.background =
                                    'transparent'
                            }}
                        >
                            <span>{action.icon}</span>
                            <span style={{ fontSize: '12px' }}>{action.label}</span>
                        </button>
                    ))}
                </div>

                {/* Expandable note input */}
                {expandedAction === 'add-note' && (
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
                            placeholder="备注..."
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
