/**
 * HighlighterCapsule — fixed status pill for Mode B (machine-gun mode).
 *
 * Shows a compact semi-transparent capsule at the top-right corner.
 * Displays a pulsing green dot and a +1 float animation on each capture.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

interface HighlighterCapsuleProps {
    /** Number of captures in the current Mode B session */
    captureCount: number
    /** Called when the user clicks ✖️ to exit Mode B */
    onExit: () => void
}

export default function HighlighterCapsule({
    captureCount,
    onExit,
}: HighlighterCapsuleProps) {
    const [showPulse, setShowPulse] = useState(false)
    const [floats, setFloats] = useState<number[]>([])
    const prevCountRef = useRef(captureCount)

    // Trigger pulse and +1 float whenever captureCount increases
    useEffect(() => {
        if (captureCount > prevCountRef.current) {
            setShowPulse(true)
            setFloats(prev => [...prev, Date.now()])
            const timer = setTimeout(() => setShowPulse(false), 400)
            prevCountRef.current = captureCount
            return () => clearTimeout(timer)
        }
    }, [captureCount])

    // Auto-clean floats after animation
    useEffect(() => {
        if (floats.length === 0) return
        const timer = setTimeout(() => {
            setFloats(prev => prev.slice(1))
        }, 800)
        return () => clearTimeout(timer)
    }, [floats])

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onExit()
            }
        },
        [onExit]
    )

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    return (
        <div
            style={{
                position: 'fixed',
                top: '16px',
                right: '16px',
                zIndex: 999999,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(30, 30, 30, 0.88)',
                backdropFilter: 'blur(12px)',
                borderRadius: '24px',
                padding: '8px 16px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '13px',
                color: '#e0e0e0',
                userSelect: 'none',
                border: '1px solid rgba(255,255,255,0.08)',
                animation: 'ann-capsule-slidein 0.25s ease',
            }}
        >
            {/* Green recording dot */}
            <span
                style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: showPulse ? '#4cff72' : '#4caf50',
                    boxShadow: showPulse
                        ? '0 0 8px 2px rgba(76,175,80,0.6)'
                        : '0 0 4px 1px rgba(76,175,80,0.3)',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                }}
            />

            {/* Status text */}
            <span style={{ color: '#a0d8a0', fontWeight: 500 }}>
                采集中...
            </span>

            {/* Capture counter */}
            {captureCount > 0 && (
                <span
                    style={{
                        background: 'rgba(76,175,80,0.2)',
                        color: '#4caf50',
                        borderRadius: '12px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                    }}
                >
                    {captureCount}
                </span>
            )}

            {/* +1 float animations */}
            <div style={{ position: 'relative', width: 0, height: 0 }}>
                {floats.map(key => (
                    <span
                        key={key}
                        style={{
                            position: 'absolute',
                            left: '-20px',
                            bottom: '4px',
                            color: '#4caf50',
                            fontSize: '13px',
                            fontWeight: 700,
                            animation: 'ann-float-up 0.7s ease forwards',
                            pointerEvents: 'none',
                        }}
                    >
                        +1
                    </span>
                ))}
            </div>

            {/* Divider */}
            <span
                style={{
                    width: '1px',
                    height: '16px',
                    background: 'rgba(255,255,255,0.12)',
                }}
            />

            {/* Exit button */}
            <button
                onClick={onExit}
                title="退出 (Esc)"
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#999',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    transition: 'color 0.15s, background 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                }}
                onMouseEnter={e => {
                    ; (e.currentTarget as HTMLElement).style.color = '#ff6b6b'
                        ; (e.currentTarget as HTMLElement).style.background =
                            'rgba(255,107,107,0.1)'
                }}
                onMouseLeave={e => {
                    ; (e.currentTarget as HTMLElement).style.color = '#999'
                        ; (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
            >
                ✖️
                <span style={{ fontSize: '11px' }}>Esc</span>
            </button>
        </div>
    )
}
