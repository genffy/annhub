/**
 * ClipToast — feedback after a clip (extension.md §3.3): "已剪藏"
 * with a ~3s window to 撤销, which deletes the clip that was just saved.
 */
import { useEffect, useRef, useState } from 'react'
import { uiText } from '../../utils/ui-text'

export const CLIP_TOAST_MS = 3000

export interface ClipToastProps {
  clipId: string
  /** The save failed: show the failure instead of the undo toast. */
  failed: boolean
  /** Deletes the saved clip; resolves whether the background confirmed. */
  onUndo: (clipId: string) => Promise<boolean>
  onDone: () => void
}

type Phase = 'saved' | 'undone' | 'undo-failed' | 'save-failed'

export default function ClipToast({ clipId, failed, onUndo, onDone }: ClipToastProps) {
  const [phase, setPhase] = useState<Phase>(failed ? 'save-failed' : 'saved')
  // The parent passes an inline callback; keep it out of the timer's dependencies
  // so a parent re-render cannot extend the 3s undo window.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // The undo window closes after ~3s; the result messages linger briefly.
  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), phase === 'saved' ? CLIP_TOAST_MS : 1500)
    return () => clearTimeout(timer)
  }, [phase])

  const undo = async () => {
    const removed = await onUndo(clipId)
    setPhase(removed ? 'undone' : 'undo-failed')
  }

  const message =
    phase === 'saved' ? uiText('clip.saved') : phase === 'undone' ? uiText('clip.undone') : phase === 'undo-failed' ? uiText('clip.undoFailed') : uiText('clip.failed')

  return (
    <div
      role="status"
      data-testid="clip-toast"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '24px',
        transform: 'translateX(-50%)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: 'rgba(30, 30, 30, 0.96)',
        color: '#f1f1f4',
        borderRadius: '10px',
        padding: '9px 14px',
        fontSize: '13px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <span>{message}</span>
      {phase === 'saved' && (
        <button
          onClick={undo}
          data-testid="clip-undo"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: '6px',
            color: '#f1f1f4',
            padding: '3px 10px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {uiText('clip.undo')}
        </button>
      )}
    </div>
  )
}
