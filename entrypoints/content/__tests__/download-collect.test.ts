import { beforeEach, describe, expect, it } from 'vitest'
import { collectMedia, findMainArticle } from '../download-collect'
import { resolveImageCandidates, resolveImageSource } from '../media-source'

/**
 * download.md §5.1 at the collector: the declared address in the doc's order,
 * duplicates once, trackers and SVGs out, a poster only for a video without
 * a direct file; and §2.4's main-article pick — the article block with the
 * most text.
 */

const page = (body: string): void => {
  document.body.innerHTML = `<div id="root">${body}</div>`
}

beforeEach(() => {
  // jsdom keeps its own origin; relative-address assertions resolve against it
})

describe('resolveImageSource (download.md §5.1)', () => {
  it('prefers the largest srcset, then currentSrc, src and lazy addresses', () => {
    page(`
      <img id="live" src="https://cdn.example.com/fallback.jpg" data-src="https://cdn.example.com/lazy.jpg" />
      <img id="lazy" src="data:image/gif;base64,xxx" data-src="https://cdn.example.com/lazy.jpg" />
      <img id="set" src="https://cdn.example.com/tiny.jpg" srcset="https://cdn.example.com/w800.jpg 800w, https://cdn.example.com/w200.jpg 200w" />
      <img id="unloaded" src="data:image/gif;base64,xxx" srcset="https://cdn.example.com/w800.jpg 800w, https://cdn.example.com/w200.jpg 200w" />
      <picture><source srcset="https://cdn.example.com/avif.jpg 1x" /><img id="pic" src="data:image/gif;base64,xxx" /></picture>
    `)
    Object.defineProperty(document.getElementById('live'), 'currentSrc', { value: 'https://cdn.example.com/live.jpg' })
    expect(resolveImageSource(document.getElementById('live')!, location.href)).toBe('https://cdn.example.com/live.jpg')
    // a data: placeholder in src falls through to the declared lazy address
    expect(resolveImageSource(document.getElementById('lazy')!, location.href)).toBe('https://cdn.example.com/lazy.jpg')
    // Responsive candidates outrank the small src fallback (download.md §5.1).
    expect(resolveImageCandidates(document.getElementById('set')!, location.href)).toEqual([
      'https://cdn.example.com/w800.jpg',
      'https://cdn.example.com/w200.jpg',
      'https://cdn.example.com/tiny.jpg',
    ])
    expect(resolveImageSource(document.getElementById('unloaded')!, location.href)).toBe('https://cdn.example.com/w800.jpg')
    // <picture> sources answer when the inner img has no address of its own; loaded ones already answered as currentSrc
    expect(resolveImageSource(document.getElementById('pic')!, location.href)).toBe('https://cdn.example.com/avif.jpg')
  })

  it('keeps a relative address absolute', () => {
    page(`<img id="rel" src="/img/local.png" />`)
    expect(resolveImageSource(document.getElementById('rel')!, location.href)).toBe(new URL('/img/local.png', location.href).href)
  })

  it('uses the largest candidate of the picture source selected by the browser', () => {
    page(
      `<picture><source srcset="https://cdn.example.com/other.jpg 2x"><source srcset="https://cdn.example.com/small.webp 1x, https://cdn.example.com/large.webp 2x"><img src="https://cdn.example.com/fallback.jpg"></picture>`,
    )
    const img = document.querySelector('img')!
    Object.defineProperty(img, 'currentSrc', { value: 'https://cdn.example.com/small.webp' })
    expect(resolveImageCandidates(img, location.href)).toEqual(['https://cdn.example.com/large.webp', 'https://cdn.example.com/small.webp', 'https://cdn.example.com/fallback.jpg'])
    expect(collectMedia(img, '![](https://cdn.example.com/large.webp)')).toEqual([
      { url: 'https://cdn.example.com/large.webp', kind: 'image', candidates: ['https://cdn.example.com/small.webp', 'https://cdn.example.com/fallback.jpg'] },
    ])
  })
})

describe('collectMedia (download.md §5.1, §5.2)', () => {
  it('includes the root image and referenced media nested in a section, even when folded', () => {
    page(`<h2 id="h">Section</h2><details><summary>More</summary><img src="https://cdn.example.com/folded.png"></details><h2 id="end">Next</h2>`)
    const root = document.getElementById('root')!
    const img = root.querySelector('img')!
    Object.defineProperty(img, 'checkVisibility', { value: () => false })
    const markdown = '![](https://cdn.example.com/folded.png)'
    const expected = [{ url: 'https://cdn.example.com/folded.png', kind: 'image' }]
    expect(collectMedia(img, markdown)).toEqual(expected)
    expect(collectMedia(root, markdown, { from: document.getElementById('h')!, to: document.getElementById('end')! })).toEqual(expected)
    expect(collectMedia(root, '')).toEqual([])
  })

  it('collects images, direct video and audio once each, in document order', () => {
    page(`
      <p>text</p>
      <img src="https://cdn.example.com/a.jpg" />
      <img src="https://cdn.example.com/a.jpg" />
      <video src="https://cdn.example.com/v.mp4" poster="https://cdn.example.com/p.jpg"></video>
      <audio><source src="https://cdn.example.com/song.mp3" /></audio>
      <img src="https://cdn.example.com/b.svg" />
      <img src="https://cdn.example.com/t.png" width="1" height="1" />
    `)
    const markdown = ['![](https://cdn.example.com/a.jpg)', '![](https://cdn.example.com/v.mp4)', '![](https://cdn.example.com/song.mp3)'].join('\n')
    expect(collectMedia(document.getElementById('root')!, markdown)).toEqual([
      { url: 'https://cdn.example.com/a.jpg', kind: 'image' },
      { url: 'https://cdn.example.com/v.mp4', kind: 'video' },
      { url: 'https://cdn.example.com/song.mp3', kind: 'audio' },
    ])
  })

  it('takes the poster as an image only when the video has no direct file', () => {
    page(`<video poster="https://cdn.example.com/cover.jpg" src="blob:https://blog.example.com/xyz"></video>`)
    expect(collectMedia(document.getElementById('root')!, '![](https://cdn.example.com/cover.jpg)')).toEqual([{ url: 'https://cdn.example.com/cover.jpg', kind: 'image' }])
  })

  it('leaves out media the conversion dropped as page chrome (download.md §5.1)', () => {
    page(`
      <article>
        <img class="avatar" src="https://cdn.example.com/avatar.jpg" />
        <img src="https://cdn.example.com/body.jpg" />
      </article>
    `)
    // the converter drops the avatar by its class word; the download must not fetch what the Markdown never links
    expect(collectMedia(document.getElementById('root')!, '![](https://cdn.example.com/body.jpg)')).toEqual([{ url: 'https://cdn.example.com/body.jpg', kind: 'image' }])
  })

  it('matches destinations the converter encoded', () => {
    page(`<img src="https://cdn.example.com/a (1).png" />`)
    expect(collectMedia(document.getElementById('root')!, '![](https://cdn.example.com/a%20%281%29.png)')).toEqual([{ url: 'https://cdn.example.com/a%20(1).png', kind: 'image' }])
  })

  it("restricts to a section's sibling run, like the conversion", () => {
    page(`
      <img src="https://cdn.example.com/outside.jpg" />
      <article>
        <h2 id="h">A section</h2>
        <img src="https://cdn.example.com/inside.jpg" />
        <img src="https://cdn.example.com/after.jpg" />
      </article>
    `)
    const markdown = '![](https://cdn.example.com/inside.jpg)\n![](https://cdn.example.com/after.jpg)'
    const article = document.querySelector('article')!
    const heading = document.getElementById('h')!
    const first = heading.nextElementSibling as Element
    const second = first.nextElementSibling as Element
    // to is exclusive; null runs to the end of the run
    expect(collectMedia(article, markdown, { from: first, to: second })).toEqual([{ url: 'https://cdn.example.com/inside.jpg', kind: 'image' }])
    expect(collectMedia(article, markdown, { from: first, to: null })).toEqual([
      { url: 'https://cdn.example.com/inside.jpg', kind: 'image' },
      { url: 'https://cdn.example.com/after.jpg', kind: 'image' },
    ])
  })
})

describe('findMainArticle (download.md §2.4)', () => {
  it('picks the article candidate with the most text, not the first', () => {
    page(`
      <article><p>short</p></article>
      <article>${'<p>wordy text here </p>'.repeat(20)}</article>
    `)
    const found = findMainArticle(document)!
    expect(found.textContent!.length).toBeGreaterThan(50)
  })

  it('answers null when the page declares no article', () => {
    page(`<div><p>nothing structured</p></div>`)
    expect(findMainArticle(document)).toBeNull()
  })
})
