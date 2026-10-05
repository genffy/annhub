/**
 * The confirmation shown when the capture window is closed with unsaved input
 * (extension.md §4.1): keep editing / save as highlight / save as clip /
 * discard. The two “save as” exits only exist for in-page captures — they never
 * create a ReviewState and never upgrade into a Fragment later by themselves.
 */
import { useRef } from 'react'
import { uiText } from '../../../utils/ui-text'
import { useFocusTrap } from './use-focus-trap'

export type CloseChoice = 'continue' | 'highlight' | 'clip' | 'discard'

export interface CloseDialogProps {
  /** Highlight / clip exits are offered only when the selection still exists in the page. */
  canFallback: boolean
  busy: boolean
  error: string
  onChoose: (choice: CloseChoice) => void
}

export default function CloseDialog({ canFallback, busy, error, onChoose }: CloseDialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true)
  return (
    <div style={styles.backdrop} data-ann-ui="capture-close-dialog">
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="ann-close-title" style={styles.card} tabIndex={-1}>
        <div id="ann-close-title" style={styles.title}>
          {uiText('capture.closeDialog.title')}
        </div>
        <div style={styles.hint}>{uiText(canFallback ? 'capture.closeDialog.hintFallback' : 'capture.closeDialog.hintLost')}</div>
        {error && (
          <div style={styles.error} role="alert">
            {error}
          </div>
        )}
        <div style={styles.actions}>
          <button style={styles.primary} onClick={() => onChoose('continue')} disabled={busy} data-testid="close-continue">
            {uiText('capture.closeDialog.continue')}
          </button>
          {canFallback && (
            <>
              <button style={styles.secondary} onClick={() => onChoose('highlight')} disabled={busy} data-testid="close-as-highlight">
                {uiText('capture.asHighlight')}
              </button>
              <button style={styles.secondary} onClick={() => onChoose('clip')} disabled={busy} data-testid="close-as-clip">
                {uiText('capture.asClip')}
              </button>
            </>
          )}
          <button style={styles.danger} onClick={() => onChoose('discard')} disabled={busy} data-testid="close-discard">
            {uiText('capture.closeDialog.discard')}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 1000001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ann-overlay)' },
  card: {
    width: 'min(420px, calc(100vw - 32px))',
    background: 'var(--ann-surface)',
    color: 'var(--ann-text)',
    borderRadius: '12px',
    padding: '18px',
    boxShadow: 'var(--ann-shadow)',
    fontSize: '14px',
  },
  title: { fontWeight: 600, fontSize: '15px' },
  hint: { marginTop: '6px', color: 'var(--ann-muted)', fontSize: '13px', lineHeight: 1.6 },
  error: { marginTop: '10px', background: 'var(--ann-danger-bg)', color: 'var(--ann-danger)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' },
  primary: { background: 'var(--ann-accent)', color: 'var(--ann-accent-contrast)', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' },
  secondary: {
    background: 'transparent',
    color: 'var(--ann-text)',
    border: '1px solid var(--ann-border)',
    borderRadius: '8px',
    padding: '7px 14px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  danger: {
    background: 'transparent',
    color: 'var(--ann-danger)',
    border: '1px solid var(--ann-danger)',
    borderRadius: '8px',
    padding: '7px 14px',
    fontSize: '13px',
    cursor: 'pointer',
  },
}
