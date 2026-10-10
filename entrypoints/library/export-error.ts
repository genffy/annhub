/**
 * Which words say why an export produced no file (extension.md §6: the reason and what was not exported
 * — a failed export makes no file at all, so every message says so). Decided from the stage that failed and
 * what the browser threw; the raw message itself is never shown.
 */
import type { UiTextKey } from '../../utils/ui-text'

export type ExportStage = 'build' | 'download'

export function exportFailureKey(error: unknown, stage: ExportStage): UiTextKey {
  // duck-typed: a DOMException is an Error in the browser, but not in every realm that runs the tests
  const { name, message } = (typeof error === 'object' && error !== null ? error : {}) as { name?: unknown; message?: unknown }
  const text = typeof message === 'string' ? message : ''
  if (text.includes('ZIP32')) return 'library.exportError.limit'
  if (name === 'QuotaExceededError' || /quota|no space|disk full|insufficient/i.test(text)) return 'library.exportError.quota'
  return stage === 'download' ? 'library.exportError.download' : 'library.exportError.general'
}
