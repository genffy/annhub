import { afterEach, describe, expect, it } from 'vitest'
import { permalinkForRegion } from '../permalink'

const HOME = 'https://x.com/home'
const STATUS = 'https://x.com/sre/status/1'
const FRAME = { x: 0, y: 0, width: 200, height: 100 }

function at(points: Record<string, Element>): (x: number, y: number) => Element[] {
  return (x, y) => {
    const key = `${x},${y}`
    const el = points[key]
    return el ? [el] : []
  }
}

describe('permalinkForRegion (capture.md §5)', () => {
  afterEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('records the status link of the post under the center of the frame', () => {
    document.head.innerHTML = '<base href="https://x.com/" />'
    document.body.innerHTML = `
      <article data-testid="tweet">
        <p id="body">We shipped jittered backoff.</p>
        <a href="/sre/status/1748113923456"><time>9:30</time></a>
      </article>`
    const body = document.getElementById('body')!
    const url = permalinkForRegion(FRAME, HOME, () => [body])
    expect(url).toBe('https://x.com/sre/status/1748113923456')
  })

  it('skips extension UI and still finds the post underneath', () => {
    document.head.innerHTML = '<base href="https://x.com/" />'
    document.body.innerHTML = `
      <div data-ann-ui="screenshot-session" id="shield"></div>
      <article data-testid="tweet">
        <p id="body">A post under the confirm shield.</p>
        <a href="/sre/status/9"><time>1h</time></a>
      </article>`
    const url = permalinkForRegion(FRAME, HOME, () => [document.getElementById('shield')!, document.getElementById('body')!])
    expect(url).toBe('https://x.com/sre/status/9')
  })

  it('uses a post the frame covers when the center sits in the gap between posts', () => {
    document.head.innerHTML = '<base href="https://x.com/" />'
    document.body.innerHTML = `
      <div id="gap"></div>
      <article data-testid="tweet">
        <p id="body">The post under the frame.</p>
        <a href="/sre/status/9"><time>1h</time></a>
      </article>`
    const gap = document.getElementById('gap')!
    const body = document.getElementById('body')!
    const url = permalinkForRegion(
      FRAME,
      HOME,
      at({
        '100,50': gap,
        '100,75': body,
      }),
    )
    expect(url).toBe('https://x.com/sre/status/9')
  })

  it('keeps the outer post when its permalink is the page the user is already on', () => {
    document.head.innerHTML = '<base href="https://x.com/" />'
    document.body.innerHTML = `
      <article data-testid="tweet">
        <p id="outer">The status page itself.</p>
        <a href="/sre/status/1"><time>1h</time></a>
        <article data-testid="tweet">
          <p id="quote">A quoted post.</p>
          <a href="/other/status/2"><time>2h</time></a>
        </article>
      </article>`
    const url = permalinkForRegion(
      FRAME,
      STATUS,
      at({
        '100,50': document.getElementById('outer')!,
        '100,75': document.getElementById('quote')!,
      }),
    )
    expect(url).toBe(STATUS)
  })

  it('keeps the page address when the frame covers no post', () => {
    document.body.innerHTML = '<p id="p">An ordinary paragraph.</p>'
    const url = permalinkForRegion(FRAME, 'https://engineering.example/docs', () => [document.getElementById('p')!])
    expect(url).toBe('https://engineering.example/docs')
  })
})
