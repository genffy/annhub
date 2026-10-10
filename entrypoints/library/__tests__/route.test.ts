import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, entryHashFor, hasActiveFilter, isLibraryHash, isListView, listHash, readHash, readHashFor } from '../route'

describe('route read/write round-trip (extension.md §2.2, RV-LIB-01)', () => {
  it('reads the plain list views', () => {
    expect(readHash('#/all')).toMatchObject({ view: 'all', readId: null, entryId: null })
    expect(readHash('#/clips')).toMatchObject({ view: 'clips' })
    expect(readHash('#/highlights')).toMatchObject({ view: 'highlights' })
    expect(readHash('')).toMatchObject({ view: 'all' })
  })

  it('reads filters and the drawer parameter', () => {
    const route = readHash('#/clips?q=lockstep&host=a.example&tag=retry&prop=rating&op=gt&val=2&from=2026-01-01&color=blue&e=ent_1')
    expect(route).toMatchObject({
      view: 'clips',
      search: 'lockstep',
      host: 'a.example',
      tag: 'retry',
      prop: 'rating',
      op: 'gt',
      val: '2',
      from: '2026-01-01',
      color: 'blue',
      entryId: 'ent_1',
    })
  })

  it('reads the reading route with an empty filter set', () => {
    expect(readHash('#/read/ent_9')).toMatchObject({ view: 'all', readId: 'ent_9', entryId: null, search: '' })
  })

  it('writes and re-reads every filter losslessly', () => {
    const filters = {
      ...EMPTY_FILTERS,
      search: 'needle',
      host: 'h.example',
      tag: 't',
      prop: 'rating',
      op: 'between',
      val: '1',
      val2: '5',
      from: '2026-01-01',
      to: '2026-02-01',
      color: 'green',
    }
    const hash = listHash({ view: 'screenshots', ...filters })
    expect(readHash(hash)).toMatchObject({ view: 'screenshots', ...filters })
  })

  it('writes and re-reads the type filter of the all view (extension.md §2.3)', () => {
    expect(listHash({ view: 'all', ...EMPTY_FILTERS, type: 'screenshot' })).toBe('#/all?type=screenshot')
    expect(readHash('#/all?type=screenshot')).toMatchObject({ view: 'all', type: 'screenshot' })
    expect(readHash('#/all?type=clip&q=jitter')).toMatchObject({ type: 'clip', search: 'jitter' })
    // no type in the address means no type filter; a value that is not an entry type filters nothing
    expect(readHash('#/all').type).toBe('')
    expect(readHash('#/all?type=highlight').type).toBe('')
    expect(listHash({ view: 'all', ...EMPTY_FILTERS })).toBe('#/all')
  })

  it('round-trips the read and entry routes', () => {
    expect(readHash(readHashFor('ent_x'))).toMatchObject({ readId: 'ent_x' })
    expect(readHash(entryHashFor('ent_x'))).toMatchObject({ entryId: 'ent_x' })
  })

  it('a reading route can carry the highlight it opens at (US-LIB-03)', () => {
    const hash = readHashFor('ent_x', 'hl_9')
    expect(hash).toBe('#/read/ent_x?h=hl_9')
    expect(readHash(hash)).toMatchObject({ readId: 'ent_x', highlightId: 'hl_9', entryId: null })
    expect(readHash(readHashFor('ent_x'))).toMatchObject({ readId: 'ent_x', highlightId: null })
    // the parameter belongs to the reading route only; a list route never reports one
    expect(readHash('#/clips?h=hl_9').highlightId).toBeNull()
    expect(isLibraryHash(hash)).toBe(true)
    // ids with unusual characters survive the round trip
    expect(readHash(readHashFor('ent_x', 'hl a&b')).highlightId).toBe('hl a&b')
  })

  it('isLibraryHash accepts the routes this module owns', () => {
    expect(isLibraryHash('#/all')).toBe(true)
    expect(isLibraryHash('#/read/ent_x')).toBe(true)
    expect(isLibraryHash('#/entry/ent_x')).toBe(true)
    expect(isLibraryHash('')).toBe(true)
    expect(isLibraryHash('#/settings?x=1')).toBe(true)
  })
})

describe('which views list, and when a filter is on (extension.md §2.3, §5)', () => {
  it('only the four list views carry the search and filter bar', () => {
    for (const view of ['all', 'clips', 'highlights', 'screenshots'] as const) expect(isListView(view), view).toBe(true)
    for (const view of ['properties', 'settings'] as const) expect(isListView(view), view).toBe(false)
  })

  it('no filter is on by default, in any view', () => {
    for (const view of ['all', 'clips', 'highlights', 'screenshots'] as const) expect(hasActiveFilter({ view, ...EMPTY_FILTERS }), view).toBe(false)
  })

  it('each of search, source, tag, property and time turns it on', () => {
    const on = { search: 'x', host: 'a.example', tag: 't', prop: 'title', from: '2026-01-01', to: '2026-02-01' }
    for (const [field, value] of Object.entries(on)) expect(hasActiveFilter({ view: 'clips', ...EMPTY_FILTERS, [field]: value }), field).toBe(true)
  })

  it('the type is a filter of the all view only: the other views are one type already', () => {
    expect(hasActiveFilter({ view: 'all', ...EMPTY_FILTERS, type: 'clip' })).toBe(true)
    expect(hasActiveFilter({ view: 'all', ...EMPTY_FILTERS, type: 'screenshot' })).toBe(true)
    for (const view of ['clips', 'screenshots', 'highlights'] as const) expect(hasActiveFilter({ view, ...EMPTY_FILTERS, type: 'clip' }), view).toBe(false)
  })

  it('the colour is a filter of the highlights view only', () => {
    expect(hasActiveFilter({ view: 'highlights', ...EMPTY_FILTERS, color: 'blue' })).toBe(true)
    expect(hasActiveFilter({ view: 'clips', ...EMPTY_FILTERS, color: 'blue' })).toBe(false)
  })

  it('an operator or value without a property filters nothing', () => {
    expect(hasActiveFilter({ view: 'all', ...EMPTY_FILTERS, op: 'contains', val: 'x', val2: 'y' })).toBe(false)
  })

  it('clearing the filters turns every one of them off, the colour included', () => {
    const route = readHash('#/highlights?q=a&host=h&tag=t&prop=p&op=contains&val=v&from=2026-01-01&to=2026-02-01&color=blue')
    expect(hasActiveFilter(route)).toBe(true)
    expect(hasActiveFilter({ ...route, ...EMPTY_FILTERS })).toBe(false)
    const all = readHash('#/all?type=screenshot')
    expect(hasActiveFilter(all)).toBe(true)
    expect(hasActiveFilter({ ...all, ...EMPTY_FILTERS })).toBe(false)
  })
})
