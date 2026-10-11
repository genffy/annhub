import { describe, expect, it, beforeEach } from 'vitest'
import { detectIdentityRects, identityElements, identityPartOf, identitySelectorsForHost } from '../detect'

function mount(html: string): void {
  document.body.innerHTML = html
}

describe('identitySelectorsForHost', () => {
  it('adds X selectors on x.com and twitter.com (incl. subdomains)', () => {
    // X's real DOM uses data-testid="User-Name" (singular) — 真机走查 P2-12:
    // the plural form never matched, leaving names and handles in the shot.
    expect(identitySelectorsForHost('x.com')).toContain('[data-testid="User-Name"]')
    expect(identitySelectorsForHost('mobile.twitter.com')).toContain('[data-testid^="UserAvatar"]')
  })

  it('falls back to the generic hook elsewhere', () => {
    expect(identitySelectorsForHost('wsj.com')).toEqual(['[data-ann-identity]'])
  })
})

describe('identity kinds (screenshot.md §3)', () => {
  it('tells avatars from names and handles', () => {
    mount(`
      <div data-testid="UserAvatar-Container-somebody" id="x-avatar"></div>
      <div data-testid="User-Name" id="x-name"></div>
      <span data-ann-identity="avatar" id="avatar"></span>
      <span data-ann-identity id="name"></span>
    `)
    const part = (id: string) => identityPartOf(document.getElementById(id)!)
    expect([part('x-avatar'), part('x-name'), part('avatar'), part('name')]).toEqual(['avatar', 'name', 'avatar', 'name'])
  })

  it('leaves out the kinds switched off, and lists an element that matches two selectors once', () => {
    mount(`
      <div data-testid="UserAvatar-Container-somebody" data-ann-identity="avatar" id="avatar"></div>
      <div data-testid="User-Name" data-ann-identity id="name"></div>
    `)
    const ids = (parts: { avatar: boolean; name: boolean }) => identityElements(document, 'x.com', parts).map(el => el.id)
    expect(ids({ avatar: true, name: true })).toEqual(['name', 'avatar'])
    expect(ids({ avatar: false, name: true })).toEqual(['name'])
    expect(ids({ avatar: true, name: false })).toEqual(['avatar'])
    expect(ids({ avatar: false, name: false })).toEqual([])
  })
})

describe('detectIdentityRects', () => {
  beforeEach(() => {
    // jsdom layout: getBoundingClientRect returns zeros unless stubbed.
    Element.prototype.getBoundingClientRect = function () {
      const el = this as HTMLElement
      const meta = JSON.parse(el.dataset.rect ?? '{"left":0,"top":0,"width":0,"height":0}')
      return {
        left: meta.left,
        top: meta.top,
        width: meta.width,
        height: meta.height,
        right: meta.left + meta.width,
        bottom: meta.top + meta.height,
        x: meta.left,
        y: meta.top,
        toJSON: () => ({}),
      } as DOMRect
    }
  })

  const fullSelection = { x: 0, y: 0, width: 1280, height: 800 }

  it('collects generic [data-ann-identity] elements inside the selection', () => {
    mount(`
      <div data-ann-identity data-rect='{"left":10,"top":20,"width":100,"height":30}'>alice</div>
      <div data-ann-identity data-rect='{"left":10,"top":60,"width":100,"height":30}'>bob</div>
    `)
    const rects = detectIdentityRects(document, 'example.com', fullSelection)
    expect(rects).toHaveLength(2)
    expect(rects[0]).toEqual({ x: 10, y: 20, width: 100, height: 30 })
  })

  it('excludes elements outside the selection or viewport, and zero-area ones', () => {
    mount(`
      <div data-ann-identity data-rect='{"left":2000,"top":20,"width":50,"height":50}'>offscreen</div>
      <div data-ann-identity data-rect='{"left":10,"top":10,"width":0,"height":0}'>collapsed</div>
      <div data-ann-identity data-rect='{"left":900,"top":20,"width":100,"height":50}'>outside-selection</div>
    `)
    const rects = detectIdentityRects(document, 'example.com', { x: 0, y: 0, width: 500, height: 800 })
    expect(rects).toHaveLength(0)
  })

  it('clips a straddling element to the selection', () => {
    mount(`<div data-ann-identity data-rect='{"left":450,"top":20,"width":100,"height":30}'>straddle</div>`)
    const rects = detectIdentityRects(document, 'example.com', { x: 0, y: 0, width: 500, height: 800 })
    expect(rects).toEqual([{ x: 450, y: 20, width: 50, height: 30 }])
  })

  it('proposes no mosaic for a kind switched off', () => {
    mount(`
      <div data-testid="UserAvatar-Container-somebody" data-rect='{"left":10,"top":20,"width":40,"height":40}'></div>
      <div data-testid="User-Name" data-rect='{"left":60,"top":20,"width":200,"height":40}'>Somebody @somebody</div>
    `)
    expect(detectIdentityRects(document, 'x.com', fullSelection, { avatar: true, name: false })).toEqual([{ x: 10, y: 20, width: 40, height: 40 }])
    expect(detectIdentityRects(document, 'x.com', fullSelection, { avatar: false, name: true })).toEqual([{ x: 60, y: 20, width: 200, height: 40 }])
  })

  it('dedupes near-identical rects when several selectors match the same element', () => {
    mount(`
      <div data-testid="User-Name" data-ann-identity data-rect='{"left":10,"top":20,"width":120,"height":40}'>name</div>
    `)
    const rects = detectIdentityRects(document, 'x.com', fullSelection)
    expect(rects).toHaveLength(1)
  })
})
