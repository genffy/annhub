import { describe, expect, it } from 'vitest'
import { EXPORT_UI_IDLE, exportUiReducer } from '../use-export-state'

/** The export card's state is one reducer (RV-LIB-20): a run resets the card, its outcome fills it. */
describe('exportUiReducer (RV-LIB-20)', () => {
  it('a run starts from a clean card, whatever was on it', () => {
    const busy = exportUiReducer({ phase: 'done', summary: '3 entries', missing: ['a.png'], error: 'old' }, { type: 'started' })
    expect(busy).toEqual({ phase: 'busy', summary: '', missing: [], error: '' })
    expect(exportUiReducer(EXPORT_UI_IDLE, { type: 'started' })).toEqual({ phase: 'busy', summary: '', missing: [], error: '' })
  })

  it("the outcome fills the card in one step: the run's phase, summary, missing and error", () => {
    expect(
      exportUiReducer(EXPORT_UI_IDLE, {
        type: 'finished',
        outcome: { state: 'partial', summary: '2 clips, 1 missing image', missing: ['x.jpg'], error: '' },
      }),
    ).toEqual({ phase: 'partial', summary: '2 clips, 1 missing image', missing: ['x.jpg'], error: '' })
    expect(exportUiReducer(EXPORT_UI_IDLE, { type: 'finished', outcome: { state: 'failed', summary: '', missing: [], error: '导出失败' } })).toEqual({
      phase: 'failed',
      summary: '',
      missing: [],
      error: '导出失败',
    })
  })
})
