import { describe, it, expect, vi } from 'vitest'
import { isWithinViewportWindowByRect, isElementWithinViewportWindow } from '../viewport'

describe('viewport window', () => {
  it('checks rectangle against a 2x viewport window (±0.5 screen)', () => {
    const viewport = 1000

    expect(isWithinViewportWindowByRect({ top: 100, bottom: 200 }, viewport, 0.5)).toBe(true)
    expect(isWithinViewportWindowByRect({ top: -400, bottom: -10 }, viewport, 0.5)).toBe(true)
    expect(isWithinViewportWindowByRect({ top: 1400, bottom: 1600 }, viewport, 0.5)).toBe(true)

    expect(isWithinViewportWindowByRect({ top: -700, bottom: -600 }, viewport, 0.5)).toBe(false)
    expect(isWithinViewportWindowByRect({ top: 1700, bottom: 1800 }, viewport, 0.5)).toBe(false)
  })

  it('checks element position using getBoundingClientRect', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 1000,
      configurable: true,
    })

    const el = document.createElement('div')

    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top: 1200,
      bottom: 1300,
      left: 0,
      right: 0,
      width: 0,
      height: 100,
      x: 0,
      y: 1200,
      toJSON: () => ({}),
    } as DOMRect)

    expect(isElementWithinViewportWindow(el, 0.5)).toBe(true)
  })

  it('treats rect exactly at boundary as inside', () => {
    const viewport = 1000
    // topBound = -500, bottomBound = 1500
    expect(isWithinViewportWindowByRect({ top: -500, bottom: -500 }, viewport, 0.5)).toBe(true)
    expect(isWithinViewportWindowByRect({ top: 1500, bottom: 1500 }, viewport, 0.5)).toBe(true)
  })

  it('handles zero expansion ratio (exact viewport only)', () => {
    const viewport = 1000
    // topBound = 0, bottomBound = 1000
    expect(isWithinViewportWindowByRect({ top: 500, bottom: 600 }, viewport, 0)).toBe(true)
    expect(isWithinViewportWindowByRect({ top: -100, bottom: -50 }, viewport, 0)).toBe(false)
    expect(isWithinViewportWindowByRect({ top: 1050, bottom: 1100 }, viewport, 0)).toBe(false)
  })

  it('handles large expansion ratio', () => {
    const viewport = 1000
    // expansionRatio = 2: topBound = -2000, bottomBound = 3000
    expect(isWithinViewportWindowByRect({ top: -1900, bottom: -1800 }, viewport, 2)).toBe(true)
    expect(isWithinViewportWindowByRect({ top: 2800, bottom: 2900 }, viewport, 2)).toBe(true)
    expect(isWithinViewportWindowByRect({ top: -2100, bottom: -2050 }, viewport, 2)).toBe(false)
  })

  it('returns true for zero viewport height (fallback in isElementWithinViewportWindow)', () => {
    Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true })
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 0, configurable: true })

    const el = document.createElement('div')
    // When viewport is 0, isElementWithinViewportWindow returns true (safe fallback)
    expect(isElementWithinViewportWindow(el, 0.5)).toBe(true)
  })
})
