/**
 * The export dialog (extension.md §2.2, storage.md §6): the one export
 * command explains what goes into the ZIP and what does not before it
 * runs, shows the shared indeterminate progress while it works (the
 * export reports no numbers of its own), and answers with the result
 * banner — a partial export never reads as a full success. The export
 * itself is the existing one; this dialog only frames it.
 */
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Download, TriangleAlert } from 'lucide-react'
import { uiText, type UiTextKey } from './ui-text'

/** The export machinery's states (the nav note uses the same ones); `ready` is the dialog's own unstarted state. */
type Phase = 'idle' | 'busy' | 'done' | 'partial' | 'failed'

interface Props {
  phase: Phase
  /** How many entries the library holds — the one number the ready state can state up front. */
  count: number
  summary: string
  missing: string[]
  error: string
  onExport(): void
  onClose(): void
}

export function ExportDialog({ phase, count, summary, missing, error, onExport, onClose }: Props) {
  // a completed export leaves its state behind in the nav; a dialog opened again starts over
  const [started, setStarted] = useState(false)
  const state = started ? (phase === 'idle' ? 'ready' : phase) : 'ready'
  const root = useRef<HTMLDivElement>(null)

  const stateKey: UiTextKey =
    state === 'done'
      ? 'library.exportState.full'
      : state === 'partial'
        ? 'library.exportPartial'
        : state === 'failed'
          ? 'library.exportState.failed'
          : state === 'busy'
            ? 'library.exportState.busy'
            : 'library.exportState.ready'

  // the keyboard enters at the primary action, and lands on 完成 once a result is in
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('.export-actions button:not([disabled])')?.focus({ preventScroll: true })
  }, [state])

  /** Esc and the scrim close the dialog — except while the export runs: closing then would suggest it can be stopped, and it cannot. */
  const closeIfIdle = () => {
    if (state !== 'busy') onClose()
  }

  return (
    <div
      ref={root}
      className="export-backdrop"
      onClick={event => {
        if (event.target === event.currentTarget) closeIfIdle()
      }}
      onKeyDownCapture={event => {
        if (event.key === 'Escape') {
          if (state !== 'busy') {
            event.stopPropagation()
            onClose()
          }
          return
        }
        if (event.key !== 'Tab' || !root.current) return
        const focusable = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
        if (focusable.length === 0) return
        const first = focusable[0]!
        const last = focusable[focusable.length - 1]!
        if (event.shiftKey && (document.activeElement === first || !root.current.contains(document.activeElement))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !root.current.contains(document.activeElement))) {
          event.preventDefault()
          first.focus()
        }
      }}
    >
      <div className="export-card" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" aria-busy={state === 'busy'} data-testid="export-dialog">
        <div className="export-head">
          <h3 id="export-dialog-title">{uiText('library.export')}</h3>
          <span className={`export-state export-state-${state}`}>{uiText(stateKey)}</span>
        </div>

        {state === 'ready' && (
          <>
            <p className="export-intro">{uiText('library.exportIntro', { count })}</p>
            <div className="export-scope">
              <div>
                <p className="export-scope-h">{uiText('library.exportIncludes')}</p>
                <p className="export-scope-b">{uiText('library.exportIncludesBody')}</p>
              </div>
              <div>
                <p className="export-scope-h">{uiText('library.exportExcludes')}</p>
                <p className="export-scope-b">{uiText('library.exportExcludesBody')}</p>
              </div>
            </div>
            <div className="export-actions">
              <button type="button" className="ghost quiet" onClick={onClose}>
                {uiText('common.cancel')}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setStarted(true)
                  onExport()
                }}
              >
                <Download size={14} aria-hidden /> {uiText('library.exportZip')}
              </button>
            </div>
          </>
        )}

        {state === 'busy' && (
          <>
            <p className="export-intro">{uiText('library.exportBusyHint')}</p>
            <progress aria-hidden />
            {/* no cancel button: the running export cannot be stopped, and a button that did nothing would say otherwise */}
          </>
        )}

        {(state === 'done' || state === 'partial' || state === 'failed') && (
          <>
            {state === 'done' && (
              <div className="banner banner-ok">
                <CheckCircle2 size={15} aria-hidden />
                <div>
                  <b>{uiText('library.exportDone')}</b>：{summary}
                </div>
              </div>
            )}
            {state === 'partial' && (
              <div className="banner banner-warn" data-testid="export-partial-banner">
                <TriangleAlert size={15} aria-hidden />
                <div>
                  <b>{uiText('library.exportPartial')}</b>：{summary}
                  {missing.length > 0 && (
                    <ul>
                      {missing.map(id => (
                        <li key={id}>
                          <code>{id}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {state === 'failed' && (
              <div className="banner banner-danger">
                <CircleAlert size={15} aria-hidden />
                <div>{error}</div>
              </div>
            )}
            {state !== 'failed' && <p className="export-note">{uiText('library.exportReadmeNote')}</p>}
            <div className="export-actions">
              <button type="button" className="primary" onClick={onClose}>
                {uiText('library.exportFinish')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
