import { useCallback, useReducer } from 'react'
import { runExport } from './export-run'

/** The export card's phase, what it sums up and what it could not include (storage.md §6). */
export type ExportPhase = 'idle' | 'busy' | 'done' | 'partial' | 'failed'

export interface ExportUiState {
  phase: ExportPhase
  summary: string
  missing: string[]
  error: string
}

export type ExportUiAction = { type: 'started' } | { type: 'finished'; outcome: { state: ExportPhase; summary: string; missing: string[]; error: string } }

/** The export card's whole state, as one pure transition (RV-LIB-20): a run resets, its outcome fills. */
export function exportUiReducer(_state: ExportUiState, action: ExportUiAction): ExportUiState {
  if (action.type === 'started') return { phase: 'busy', summary: '', missing: [], error: '' }
  return { phase: action.outcome.state, summary: action.outcome.summary, missing: action.outcome.missing, error: action.outcome.error }
}

export const EXPORT_UI_IDLE: ExportUiState = { phase: 'idle', summary: '', missing: [], error: '' }

/**
 * The export the nav button runs (RV-LIB-20, split out of App): the state is one reducer, so a
 * second click mid-run cannot show a half-updated card, and the run's outcome lands as one step.
 */
export function useExportState() {
  const [state, dispatch] = useReducer(exportUiReducer, EXPORT_UI_IDLE)
  const start = useCallback(async () => {
    dispatch({ type: 'started' })
    const outcome = await runExport()
    dispatch({ type: 'finished', outcome })
  }, [])
  return { export: state, startExport: start }
}
