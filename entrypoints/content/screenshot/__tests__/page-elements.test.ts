import { describe, expect, it } from 'vitest'
import { pageElementsFromPoint } from '../page-elements'

describe('pageElementsFromPoint', () => {
  it('answers nothing where the browser has no elementsFromPoint', () => {
    const host = document.createElement('div')
    const doc = {} as Document
    expect(pageElementsFromPoint(doc, host, 10, 10)).toEqual([])
    expect(host.style.pointerEvents).toBe('')
  })

  it('lifts the confirm shield for the call and puts it back, never left down', () => {
    const host = document.createElement('div')
    host.className = 'ann-shot-modal'
    const page = document.createElement('p')
    const hits = [page]
    const doc = document
    const calls: Array<[number, number, string]> = []
    Object.defineProperty(doc, 'elementsFromPoint', {
      configurable: true,
      value: (x: number, y: number) => {
        calls.push([x, y, host.style.pointerEvents])
        return hits
      },
    })
    expect(pageElementsFromPoint(doc, host, 30, 40)).toEqual([page])
    // the shield was down when the page was asked, and is back up afterwards
    expect(calls).toEqual([[30, 40, 'none']])
    expect(host.style.pointerEvents).toBe('auto')
    delete (doc as unknown as Record<string, unknown>).elementsFromPoint
  })

  it('touches the pointer style only when the shield is on', () => {
    const host = document.createElement('div')
    const doc = document
    Object.defineProperty(doc, 'elementsFromPoint', { configurable: true, value: () => [] })
    pageElementsFromPoint(doc, host, 0, 0)
    expect(host.style.pointerEvents).toBe('')
    delete (doc as unknown as Record<string, unknown>).elementsFromPoint
  })
})
