import { describe, it, expect, beforeEach } from 'vitest'
import {
    HighlightDOMManager,
    extractTwitterPermalink,
    TWEET_STATUS_RE,
    TWEET_STATUS_PREFIX_RE,
} from '../highlight-dom'

// ─── isDynamicId ────────────────────────────────────────────────────────────

describe('HighlightDOMManager.isDynamicId', () => {
    it('detects x.com dynamic IDs (id__xxx)', () => {
        expect(HighlightDOMManager.isDynamicId('id__3ipr8wqpubk')).toBe(true)
        expect(HighlightDOMManager.isDynamicId('id__k7pnu4f73sp')).toBe(true)
        expect(HighlightDOMManager.isDynamicId('id__0ixjn61s53zo')).toBe(true)
    })

    it('detects React generated IDs (:rXX:)', () => {
        expect(HighlightDOMManager.isDynamicId(':r0:')).toBe(true)
        expect(HighlightDOMManager.isDynamicId(':r1a:')).toBe(true)
        expect(HighlightDOMManager.isDynamicId(':r2b3:')).toBe(true)
    })

    it('detects long hex strings', () => {
        expect(HighlightDOMManager.isDynamicId('a1b2c3d4e5f6a7b8')).toBe(true)
        expect(HighlightDOMManager.isDynamicId('0123456789abcdef0123')).toBe(true)
    })

    it('does NOT flag stable / semantic IDs', () => {
        expect(HighlightDOMManager.isDynamicId('main-content')).toBe(false)
        expect(HighlightDOMManager.isDynamicId('header')).toBe(false)
        expect(HighlightDOMManager.isDynamicId('post-123')).toBe(false)
        expect(HighlightDOMManager.isDynamicId('app')).toBe(false)
        expect(HighlightDOMManager.isDynamicId('sidebar-nav')).toBe(false)
    })
})

// ─── generateSelector ───────────────────────────────────────────────────────

describe('HighlightDOMManager.generateSelector', () => {
    function makeRange(container: Node, start = 0, end = 0): Range {
        const range = document.createRange()
        range.setStart(container, start)
        range.setEnd(container, end || (container.textContent?.length ?? 0))
        return range
    }

    it('uses data-testid when available', () => {
        const div = document.createElement('div')
        div.setAttribute('data-testid', 'tweetText')
        div.textContent = 'hello world'
        document.body.appendChild(div)

        const range = makeRange(div.firstChild!)
        const selector = HighlightDOMManager.generateSelector(range)
        expect(selector).toBe('[data-testid="tweetText"]')

        document.body.removeChild(div)
    })

    it('uses stable id when not dynamic', () => {
        const div = document.createElement('div')
        div.id = 'main-content'
        div.textContent = 'hello'
        document.body.appendChild(div)

        const range = makeRange(div.firstChild!)
        const selector = HighlightDOMManager.generateSelector(range)
        expect(selector).toBe('div#main-content')

        document.body.removeChild(div)
    })

    it('skips dynamic x.com id and falls back to class', () => {
        const div = document.createElement('div')
        div.id = 'id__3ipr8wqpubk'
        div.className = 'css-175oi2r r-bcqeeo'
        div.textContent = 'tweet text'
        document.body.appendChild(div)

        const range = makeRange(div.firstChild!)
        const selector = HighlightDOMManager.generateSelector(range)
        expect(selector).not.toContain('id__3ipr8wqpubk')
        expect(selector).toContain('css-175oi2r')

        document.body.removeChild(div)
    })

    it('skips React dynamic id', () => {
        const span = document.createElement('span')
        span.id = ':r0:'
        span.className = 'content'
        span.textContent = 'react content'
        document.body.appendChild(span)

        const range = makeRange(span.firstChild!)
        const selector = HighlightDOMManager.generateSelector(range)
        expect(selector).not.toContain(':r0:')
        expect(selector).toContain('content')

        document.body.removeChild(span)
    })

    it('filters out Tailwind utility classes with special chars', () => {
        const div = document.createElement('div')
        div.className = 'text-lg md:pt-[60px] normal-class'
        div.textContent = 'content'
        document.body.appendChild(div)

        const range = makeRange(div.firstChild!)
        const selector = HighlightDOMManager.generateSelector(range)
        expect(selector).toContain('normal-class')
        expect(selector).not.toContain('md:pt-')
        expect(selector).not.toContain('[60px]')

        document.body.removeChild(div)
    })
})

// ─── Tweet status regex patterns ────────────────────────────────────────────

describe('Tweet status URL patterns', () => {
    it('TWEET_STATUS_RE matches exact /{user}/status/{id}', () => {
        expect(TWEET_STATUS_RE.test('/DIYgod/status/2023254968434901411')).toBe(true)
        expect(TWEET_STATUS_RE.test('/lewangx/status/2023473037404938471')).toBe(true)
    })

    it('TWEET_STATUS_RE does NOT match sub-paths', () => {
        expect(TWEET_STATUS_RE.test('/DIYgod/status/2023254968434901411/analytics')).toBe(false)
        expect(TWEET_STATUS_RE.test('/DIYgod/status/2023254968434901411/photo/1')).toBe(false)
    })

    it('TWEET_STATUS_PREFIX_RE matches status URLs with any suffix', () => {
        expect(TWEET_STATUS_PREFIX_RE.test('/DIYgod/status/2023254968434901411')).toBe(true)
        expect(TWEET_STATUS_PREFIX_RE.test('/DIYgod/status/2023254968434901411/analytics')).toBe(true)
        expect(TWEET_STATUS_PREFIX_RE.test('/DIYgod/status/2023254968434901411/photo/1')).toBe(true)
    })

    it('neither regex matches profile-only URLs', () => {
        expect(TWEET_STATUS_RE.test('/DIYgod')).toBe(false)
        expect(TWEET_STATUS_PREFIX_RE.test('/DIYgod')).toBe(false)
    })
})

// ─── extractTwitterPermalink ────────────────────────────────────────────────

describe('extractTwitterPermalink', () => {
    const origin = 'https://x.com'

    function buildArticle(innerHtml: string): Element {
        const article = document.createElement('article')
        article.innerHTML = innerHtml
        document.body.appendChild(article)
        return article
    }

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('extracts permalink from <time> parent link (Strategy 1)', () => {
        const article = buildArticle(`
            <a href="/lewangx/status/2023473037404938471">
                <time datetime="2026-02-16T19:02:21.000Z">18h</time>
            </a>
            <a href="/lewangx">@lewangx</a>
            <a href="https://external.com/some-link">External</a>
        `)

        const result = extractTwitterPermalink(article, origin)
        expect(result).toBe('https://x.com/lewangx/status/2023473037404938471')
    })

    it('extracts permalink even when time link has sub-path', () => {
        const article = buildArticle(`
            <a href="/DIYgod/status/2023254968434901411/something">
                <time datetime="2026-02-16T04:35:49.000Z">Feb 16</time>
            </a>
        `)

        const result = extractTwitterPermalink(article, origin)
        expect(result).toBe('https://x.com/DIYgod/status/2023254968434901411')
    })

    it('falls back to exact status link when no <time> (Strategy 2)', () => {
        const article = buildArticle(`
            <a href="https://x.com/lewangx">@lewangx</a>
            <a href="https://x.com/lewangx/status/2023473037404938471">link text</a>
            <a href="https://other.com/page">External</a>
        `)

        const result = extractTwitterPermalink(article, origin)
        expect(result).toBe(`${origin}/lewangx/status/2023473037404938471`)
    })

    it('falls back to analytics link and strips suffix (Strategy 3)', () => {
        const article = buildArticle(`
            <a href="https://x.com/lewangx">@lewangx</a>
            <a href="https://x.com/lewangx/status/2023473037404938471/analytics">9.4K views</a>
        `)

        const result = extractTwitterPermalink(article, origin)
        expect(result).toBe('https://x.com/lewangx/status/2023473037404938471')
    })

    it('ignores external links', () => {
        const article = buildArticle(`
            <a href="https://external.com/some-article">Visit</a>
            <a href="/user/status/111222333">
                <time datetime="2026-01-01T00:00:00.000Z">Jan 1</time>
            </a>
        `)

        const result = extractTwitterPermalink(article, origin)
        expect(result).toBe('https://x.com/user/status/111222333')
    })

    it('returns null when no status links exist', () => {
        const article = buildArticle(`
            <a href="https://x.com/someuser">@someuser</a>
            <a href="https://external.com">External</a>
        `)

        const result = extractTwitterPermalink(article, origin)
        expect(result).toBeNull()
    })

    it('prefers <time>-based link over bare status links', () => {
        const article = buildArticle(`
            <a href="https://x.com/userA/status/111">first status link</a>
            <a href="https://x.com/userB/status/222">
                <time datetime="2026-01-01">Jan 1</time>
            </a>
        `)

        const result = extractTwitterPermalink(article, origin)
        expect(result).toBe('https://x.com/userB/status/222')
    })
})
