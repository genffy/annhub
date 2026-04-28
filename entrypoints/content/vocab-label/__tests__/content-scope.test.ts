import { describe, it, expect, beforeEach, vi } from 'vitest'

let mockParsedText = ''

vi.mock('@mozilla/readability', () => ({
  Readability: class {
    parse() {
      return mockParsedText ? { textContent: mockParsedText } : null
    }
  },
}))

import { resolveContentRoot, collectAnnotatableBlocks, isExcludedSection } from '../content-scope'

describe('content scope resolver', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockParsedText = ''
  })

  it('prefers semantic content-like roots among main/article candidates', () => {
    document.body.innerHTML = `
      <header>Header area</header>
      <main id="main-root">
        <p>${'meaningful content '.repeat(10)}</p>
      </main>
      <article id="article-root">
        <p>${'article content '.repeat(10)}</p>
      </article>
    `

    const root = resolveContentRoot()
    expect(root.id).toBe('article-root')
  })

  it('falls back to readability-derived content root when semantic root is absent', () => {
    document.body.innerHTML = `
      <div id="sidebar">${'short sidebar text '.repeat(12)}</div>
      <div id="story">
        <p>unique story phrase alpha beta gamma delta epsilon zeta eta theta iota kappa lambda</p>
        <p>${'long story body '.repeat(30)}</p>
      </div>
    `

    mockParsedText = 'unique story phrase alpha beta gamma delta epsilon zeta eta theta iota kappa lambda'

    const root = resolveContentRoot()
    expect(root.id).toBe('story')
  })

  it('collects annotatable blocks while excluding nav/footer/aside/comment areas', () => {
    document.body.innerHTML = `
      <main id="main-root">
        <p id="p1">Visible paragraph text.</p>
        <nav><p id="nav-p">Navigation paragraph text.</p></nav>
        <aside><p id="aside-p">Aside paragraph text.</p></aside>
        <section class="comments"><p id="comment-p">Comment paragraph text.</p></section>
        <blockquote id="quote">Quote text.</blockquote>
      </main>
    `

    const root = document.getElementById('main-root') as Element
    const blocks = collectAnnotatableBlocks(root)
    const ids = blocks.map(el => el.id).filter(Boolean)

    expect(ids).toContain('p1')
    expect(ids).toContain('quote')
    expect(ids).not.toContain('nav-p')
    expect(ids).not.toContain('aside-p')
    expect(ids).not.toContain('comment-p')

    const navP = document.getElementById('nav-p') as Element
    expect(isExcludedSection(navP)).toBe(true)
  })

  it('narrows broad semantic root to primary content container', () => {
    document.body.innerHTML = `
      <main id="main-root">
        <section id="repo-header">
          <p>${'toolbar actions '.repeat(20)}</p>
        </section>
        <article id="readme-content" class="markdown-body">
          <p>${'core readme content '.repeat(30)}</p>
        </article>
      </main>
    `

    const root = resolveContentRoot()
    expect(root.id).toBe('readme-content')
  })

  it('prefers article containers on feed-like pages to avoid annotating non-body chrome', () => {
    document.body.innerHTML = `
      <main id="feed-root">
        <section id="composer">
          <h1>What is happening</h1>
          <p>Post composer help text only.</p>
        </section>
        <section id="timeline">
          <article id="a1"><div>${'post content alpha '.repeat(20)}</div></article>
          <article id="a2"><div>${'post content beta '.repeat(20)}</div></article>
          <article id="a3"><div>${'post content gamma '.repeat(20)}</div></article>
        </section>
      </main>
    `

    const root = document.getElementById('feed-root') as Element
    const blocks = collectAnnotatableBlocks(root)
    const ids = blocks.map(el => el.id)

    expect(ids).toEqual(['a1', 'a2', 'a3'])
    expect(ids).not.toContain('feed-root')
    expect(ids).not.toContain('composer')
  })

  it('falls back to document.body when no semantic or readability root found', () => {
    document.body.innerHTML = `
      <div><span>Short text only</span></div>
    `
    mockParsedText = ''

    const root = resolveContentRoot()
    expect(root).toBe(document.body)
  })

  it('returns root itself when no annotatable blocks found', () => {
    document.body.innerHTML = `
      <main id="empty-root">
        <img src="photo.jpg" alt="no text blocks" />
      </main>
    `

    const root = document.getElementById('empty-root') as Element
    const blocks = collectAnnotatableBlocks(root)

    expect(blocks).toEqual([root])
  })

  it('excludes sidebar and hidden elements', () => {
    document.body.innerHTML = `
      <main id="main-root">
        <p id="visible">Visible text content here.</p>
        <div id="sidebar-box" class="sidebar"><p id="sidebar-p">Sidebar content.</p></div>
        <div hidden><p id="hidden-p">Hidden content.</p></div>
        <div aria-hidden="true"><p id="aria-hidden-p">Aria hidden.</p></div>
      </main>
    `

    const root = document.getElementById('main-root') as Element
    const blocks = collectAnnotatableBlocks(root)
    const ids = blocks.map(el => el.id).filter(Boolean)

    expect(ids).toContain('visible')
    expect(ids).not.toContain('sidebar-p')
    expect(ids).not.toContain('hidden-p')
    expect(ids).not.toContain('aria-hidden-p')
  })

  it('returns single article when only one is present', () => {
    document.body.innerHTML = `
      <main id="main-root">
        <article id="single-article">
          <p>${'article content '.repeat(20)}</p>
        </article>
      </main>
    `

    const root = document.getElementById('main-root') as Element
    const blocks = collectAnnotatableBlocks(root)
    const ids = blocks.map(el => el.id)

    expect(ids).toEqual(['single-article'])
  })
})
