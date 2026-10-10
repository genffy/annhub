import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, entryHashFor, isLibraryHash, listHash, readHash, readHashFor } from '../route'

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
