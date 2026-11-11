/** X's semantic article structure (capture.md §3.2); no platform API or test attributes. */
import { resolveImageSource, resolveVideoSource } from './media-source'
import { uiText } from './ui-text'
import { codeHeader, codeLanguage } from './markdown-code'

export interface PlatformContent {
  element: Element
  sourceUrl: string
  meta: { title: string; author?: string[]; published?: string }
}

function address(raw: string | null, base: string): URL | undefined {
  try {
    const url = new URL(raw ?? '', base)
    return /^https?:$/.test(url.protocol) ? url : undefined
  } catch {
    return undefined
  }
}
function isX(url: URL): boolean {
  return /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/.test(url.hostname)
}

export function isSemanticXPost(el: Element): boolean {
  const page = address(el.ownerDocument.baseURI, el.ownerDocument.baseURI)
  if (!page || !isX(page) || !el.matches('article')) return false
  // A long-form read view renders its section headings as h1 and owns no time;
  // a quote card carries both, nested in the post it quotes (capture.md §3.2).
  const ownedTime = [...el.querySelectorAll('time')].some(time => time.closest('article') === el)
  const ownedH1 = [...el.querySelectorAll('h1')].some(heading => heading.closest('article') === el)
  if (ownedH1 && ownedTime && el.parentElement?.closest('article')) return false
  return [...el.querySelectorAll('a[href]')].some(
    link => link.closest('article') === el && /^\/[^/]+\/status\/\d+/.test(address(link.getAttribute('href'), page.href)?.pathname ?? ''),
  )
}

/** X renders the meta row's separator as a bare leaf; it is interface, not content. */
const SEPARATOR_ONLY = /^·+$/
/** Reading-time labels ("14 min read") are interface metadata, never author text. */
const READING_TIME = /^\d+\s*(?:min(?:ute)?s?\s*read|分钟\s*(?:读完|阅读))$/i

/** Links to engagement listings (view analytics, quote lists) are interface rows. */
function isEngagementLink(el: Element | null, baseURI: string): boolean {
  const raw = el?.getAttribute('href') ?? null
  try {
    const href = raw ? new URL(raw, baseURI) : undefined
    return Boolean(href && /^https?:$/.test(href.protocol) && isX(href) && /\/(analytics|quotes|retweets|likes|bookmarks)$/.test(href.pathname))
  } catch {
    return false
  }
}

/** X's quoted post in the current DOM is a `role=link` card with its own timestamp and a user avatar (Q-27); older builds nested an `article`. */
function isQuoteCard(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'div' || !el.matches('[role="link"]') || !el.hasAttribute('tabindex')) return false
  if (![...el.querySelectorAll('time')].some(time => time.closest('[role="link"]') === el)) return false
  return [...el.querySelectorAll('img')].some(img => /profile_images\//.test(resolveImageSource(img, el.ownerDocument.baseURI) ?? ''))
}

function quoteCards(article: Element): Element[] {
  return [...article.querySelectorAll('div[role="link"]')].filter(el => el.closest('article') === article && isQuoteCard(el))
}

/** Interface-only text X renders next to its controls: the quote indicator and the subscribe button's accessible description (capture.md §3.2). */
function isInterfaceLeaf(el: Element): boolean {
  if (el.querySelector('p, pre, ol, ul, table, figure, blockquote, article, h1, h2, h3, h4, h5, h6, img, video, audio, time')) return false
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return false
  // "From X Freeze" is the video credit X paints over its player, not the author's words
  return /^quote$/i.test(text) || /^引用(帖|帖文)?$/.test(text) || /^click to (subscribe|follow)/i.test(text) || /^from\s+\S+/i.test(text)
}

/** One quoted post's content: the author line, body text and media, without the card's chrome (capture.md §3.2). */
function extractQuoteCard(card: Element, pageUrl: string): PlatformContent | undefined {
  const page = address(pageUrl, pageUrl)
  if (!page || !isX(page)) return undefined
  const doc = card.ownerDocument
  const handle = quoteHandle(card)
  const name = (card.querySelector('[data-testid="User-Name"]')?.textContent ?? '').split('@')[0]?.replace(/\s+/g, ' ').trim()
  if (!handle || !name) return undefined
  const published = quotePublication(card)
  const output = doc.createElement('article')
  const byline = doc.createElement('p')
  const strong = doc.createElement('strong')
  strong.textContent = name
  byline.append(strong, ' ')
  const user = doc.createElement('a')
  user.href = new URL(`/${handle}`, page.origin).href
  user.textContent = `@${handle}`
  byline.append(user)
  if (published) {
    const date = doc.createElement('a')
    date.href = new URL(`/${handle}`, page.origin).href
    date.textContent = published
    byline.append(' · ', date)
  }
  output.append(byline)
  const win = doc.defaultView
  const candidates = [...card.querySelectorAll('div, p')].filter(el => {
    const inEngagement = el.closest('a[href]')
    return (
      /^(pre-wrap|pre-line|break-spaces)$/.test(win?.getComputedStyle(el).whiteSpace ?? '') &&
      !el.querySelector('time') &&
      !el.closest('button, [role="button"], [data-testid="User-Name"]') &&
      !(inEngagement && isEngagementLink(inEngagement, doc.baseURI)) &&
      !isInterfaceLeaf(el) &&
      !(el.children.length === 0 && SEPARATOR_ONLY.test((el.textContent ?? '').trim()))
    )
  })
  const bodies = candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el)))
  for (const body of bodies) {
    const clone = copyContent(body, doc, pageUrl, true)
    if (!clone || !cloneHasContent(clone)) continue
    const paragraph = doc.createElement('p')
    paragraph.append(...clone.childNodes)
    output.append(paragraph)
  }
  const media = [...card.querySelectorAll('img, video')].filter(el => /\/media\//.test(resolveImageSource(el, doc.baseURI) ?? '') || el.matches('video'))
  for (const el of media) {
    if (bodies.some(body => body.contains(el))) continue
    const clone = copyContent(el, doc, pageUrl, true)
    if (clone) output.append(clone)
  }
  if (!output.querySelector('p, img, video')) return undefined
  const text = bodies
    .map(body => body.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const excerpt = [...text].slice(0, 40).join('') || handle
  return { element: output, sourceUrl: page.href, meta: { title: `${name} - ${excerpt}`, author: [`${name} (@${handle})`], ...(published ? { published } : {}) } }
}

function quoteHandle(card: Element): string | undefined {
  const container = card.querySelector('[data-testid*="UserAvatar-Container-"]')
  const candidate =
    container?.getAttribute('data-testid')?.match(/UserAvatar-Container-(.+)$/)?.[1] ??
    /@([A-Za-z0-9_]+)/.exec(card.querySelector('[data-testid="User-Name"]')?.textContent ?? '')?.[1]
  // The handle goes into a URL and a text node: keep only X's actual username characters.
  return candidate?.match(/^([A-Za-z0-9_]+)$/)?.[1]
}

function quotePublication(card: Element): string | undefined {
  const time = [...card.querySelectorAll('time[datetime]')].find(el => el.closest('[role="link"]') === card)
  return time ? localDay(new Date(time.getAttribute('datetime') ?? '')) : undefined
}

/** A cloned body whose interface-only children were all dropped renders nothing. */
function cloneHasContent(clone: Node): boolean {
  if ((clone.textContent ?? '').trim()) return true
  return clone instanceof Element && clone.querySelector('img, video, audio, pre, code, table, blockquote, h1, h2, h3, h4, h5, h6, ol, ul') !== null
}

/** Clones content without page controls and preserves author-written line breaks. */
function copyContent(node: Node, doc: Document, pageUrl: string, quoted: boolean): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const fragment = doc.createDocumentFragment()
    const lines = (node.textContent ?? '').split('\n')
    lines.forEach((line, index) => {
      if (index) fragment.append(doc.createElement('br'))
      fragment.append(doc.createTextNode(line))
    })
    return fragment
  }
  if (
    !(node instanceof Element) ||
    node.matches('button, nav, aside, header, footer, form, svg, style, script, template, [role="button"], [role="group"], [role="dialog"], [role="status"], [aria-hidden="true"]')
  )
    return null
  if (node.matches('a') && isEngagementLink(node, doc.baseURI)) return null
  // X paints the video credit ("From X Freeze") over its player; it is interface, not the author's words.
  if (node instanceof Element && node.children.length === 0 && /^from\s+\S+$/i.test((node.textContent ?? '').replace(/\s+/g, ' ').trim())) return null
  // A quoted post inside the copied body becomes one quote block; inside a
  // quote it stays plain so quotes never nest (capture.md §3.2).
  if (node.matches('article') && !quoted) {
    const quote = extractXContent(node, pageUrl, true)
    if (quote) {
      const block = doc.createElement('blockquote')
      block.append(...quote.element.childNodes)
      return block
    }
  }
  // The current DOM wraps a quoted post in a role=link card, not a nested article (Q-27).
  if (isQuoteCard(node) && !quoted) {
    const quote = extractQuoteCard(node, pageUrl)
    if (quote) {
      const block = doc.createElement('blockquote')
      block.append(...quote.element.childNodes)
      return block
    }
  }
  const next = node.nextElementSibling
  const nextCode = next?.matches('pre') ? next : next?.querySelector('pre')
  // The label reads like a language only when the code declares one; an empty
  // label would otherwise drop any text-less element before an untagged block.
  const nextLanguage = nextCode ? codeLanguage(nextCode).toLowerCase() : ''
  if (nextCode && (codeHeader(nextCode) === node || (nextLanguage && next?.matches('pre') && node.textContent?.trim().toLowerCase() === nextLanguage))) return null
  if (node.matches('img') && /\/emoji\//.test(node.getAttribute('src') ?? '') && node.getAttribute('alt')) return doc.createTextNode(node.getAttribute('alt')!)
  const clone = doc.createElement(node.tagName.toLowerCase())
  // Rich editors express paragraphs as divs. Preserve their block boundary.
  const paragraph = node.matches('div') && node.getAttribute('data-block') === 'true' && !node.querySelector('pre,ol,ul,table,figure')
  const target = paragraph ? doc.createElement('p') : clone
  for (const name of ['href', 'src', 'alt', 'poster', 'srcset', 'datetime', 'start', 'alttext', 'encoding', 'display', 'data-tex']) {
    const value = node.getAttribute(name)
    if (value !== null) target.setAttribute(name, value)
  }
  if (node.matches('img')) {
    const src = resolveImageSource(node, doc.baseURI)
    // Badges and interface icons come from X's asset host; content media lives on pbs (download.md §5.1).
    if (src && /^https?:\/\/abs\.twimg\.com\//.test(src)) return null
    if (src) target.setAttribute('src', src)
  }
  if (node.matches('code')) target.className = node.className // code language is content metadata
  if (node.matches('pre, code')) {
    const code = node.matches('pre') ? node.querySelector('code') : null
    const content = code ? copyContent(code, doc, pageUrl, quoted) : doc.createTextNode(node.textContent ?? '')
    if (node.matches('pre')) {
      const language = codeLanguage(node)
      if (language) target.className = `language-${language}`
    }
    if (content) target.append(content)
    return target
  }
  for (const child of node.childNodes) {
    const copied = copyContent(child, doc, pageUrl, quoted)
    if (copied) target.append(copied)
  }
  return target
}

function localDay(date: Date): string | undefined {
  if (!Number.isFinite(date.getTime())) return undefined
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function publication(article: Element, id: string): string | undefined {
  const time = [...article.querySelectorAll('time[datetime]')].find(el => el.closest('article') === article)
  const explicit = time?.getAttribute('datetime')
  if (explicit) {
    const day = localDay(new Date(explicit))
    if (day) return day
  }
  try {
    // X status IDs carry milliseconds since the Snowflake epoch in their high bits.
    if (!/^\d{15,20}$/.test(id)) return undefined
    return localDay(new Date(Number((BigInt(id) >> 22n) + 1288834974657n)))
  } catch {
    return undefined
  }
}

export function extractXContent(root: Element, pageUrl = root.ownerDocument.baseURI, quoted = false): PlatformContent | undefined {
  const page = address(pageUrl, pageUrl)
  if (!page || !isX(page) || !root.matches('article, main')) return undefined
  const article = root.matches('article')
    ? root
    : [...root.querySelectorAll('article')].filter(el => !el.parentElement?.closest('article')).sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
  if (!article) return undefined
  // The page download round-trips AnnHub's own assembly through the worker
  // (download.md §4.3); extracting it again would reassemble the assembly.
  if (article.closest('[data-ann-platform]')) return undefined
  const own = (el: Element): boolean => el.closest('article') === article
  const links = [...article.querySelectorAll('a[href]')].filter(own)
  const statusLinks = links.filter(link => /^\/[^/]+\/status\/\d+(?:\/|$)/.test(address(link.getAttribute('href'), page.href)?.pathname ?? ''))
  // The permalink page's own status is the metadata source of truth: prefer
  // the link that points at it — the read view carries engagement links and
  // quote cards, both of which point elsewhere — and fall back to the page
  // address itself when the permalink row renders outside `article`.
  const pageMatch = /^\/([^/]+)\/status\/(\d+)(?:\/|$)/.exec(page.pathname)
  const fromLink = (link: Element | undefined): URL | undefined => (link ? address(link.getAttribute('href'), page.href) : undefined)
  const permalink = pageMatch
    ? (fromLink(statusLinks.find(link => (address(link.getAttribute('href'), page.href)?.pathname ?? '').startsWith(`/${pageMatch[1]}/status/${pageMatch[2]}`))) ?? page)
    : fromLink(statusLinks.find(link => link.querySelector('time')) ?? statusLinks[0])
  const url = permalink
  const match = url && isX(url) ? /^\/([^/]+)\/status\/(\d+)/.exec(url.pathname) : null
  if (!url || !match) return undefined
  url.pathname = `/${match[1]}/status/${match[2]}`
  url.search = ''
  url.hash = ''
  const handle = match[1]!
  const isProfileLink = (link: Element): boolean => {
    const href = address(link.getAttribute('href'), page.href)
    return Boolean(href && isX(href) && href.pathname.replace(/\/$/, '') === `/${handle}` && (link.textContent ?? '').trim() && !(link.textContent ?? '').trim().startsWith('@'))
  }
  const profile = links.find(isProfileLink) ?? (pageMatch ? [...root.ownerDocument.querySelectorAll('a[href]')].find(isProfileLink) : undefined)
  const name = (profile?.textContent ?? handle).replace(/\s+/g, ' ').trim()
  const published = publication(article, match[2]!)
  const doc = root.ownerDocument
  const output = doc.createElement('article')
  // X renders the long-form body inside a nested article without a timestamp
  // of its own (the read view); quote cards carry one. On the permalink page
  // the read view is itself the top-level article. Anchors stay semantic:
  // headings, code, time (capture.md §3.2).
  const nested = [...article.querySelectorAll('article')].filter(el => el.parentElement?.closest('article') === article)
  const cards = quoteCards(article)
  const ownsNoTime = (el: Element): boolean => ![...el.querySelectorAll('time')].some(time => time.closest('article') === el)
  const readView =
    nested.find(el => ownsNoTime(el) && (el.querySelector('h1') || el.querySelector('pre'))) ??
    (pageMatch && ownsNoTime(article) && article.querySelector('h1, pre') ? article : undefined)
  const heading = [...article.querySelectorAll('h1')].find(own)
  // The rich editor keeps the body in one contenteditable=false container
  // (capture.md §3.2): headings and code without a title heading.
  const richBody = [...article.querySelectorAll('[contenteditable="false"]')].find(el => own(el) && el.querySelector('h2,pre,ol,ul'))
  const longRoot = readView ?? (heading ? article : richBody)
  if (longRoot) {
    const h1s = [...longRoot.querySelectorAll('h1')]
    const title =
      /["“]([^"”]+)["”]/.exec(doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? doc.title)?.[1]?.trim() ??
      (h1s.length === 1 ? h1s[0]?.textContent?.trim() : undefined) ??
      heading?.textContent?.trim()
    // The root itself is an article: copy its children, or it would be treated
    // as a quote of its own.
    const body = doc.createElement('div')
    if (title)
      for (const child of longRoot.childNodes) {
        const copied = copyContent(child, doc, url.href, quoted)
        if (copied) body.append(copied)
      }
    if (title && body) {
      // Legacy shape: the author header renders before the title heading, the
      // cover between them. Keep only the cover chain; the read view has
      // nothing before its title region.
      if (!readView) {
        const marker = [...body.querySelectorAll('h1')].find(el => (el.textContent ?? '').trim() === title) ?? body.querySelector('h1')
        if (marker) {
          const cover = [...body.querySelectorAll('img')].find(
            img => !marker.contains(img) && marker.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_PRECEDING && /\/media\//.test(resolveImageSource(img, doc.baseURI) ?? ''),
          )
          for (const el of [...body.querySelectorAll('*')]) {
            if (el === marker || el.contains(marker) || el === cover || (cover !== undefined && el.contains(cover))) continue
            if (marker.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) el.remove()
          }
          marker.remove()
        }
      }
      // The article title is the file's one top-level heading; its rendered
      // container (a leaf holding nothing else) leaves with the reading-time
      // labels around it.
      body.querySelectorAll('h1').forEach(el => {
        if ((el.textContent ?? '').trim() === title) el.remove()
      })
      for (const el of [...body.querySelectorAll('div, section, span')]) {
        if (el.querySelector('p, pre, ol, ul, table, figure, blockquote, article, h1, h2, h3, h4, h5, h6, img, video, audio')) continue
        const text = (el.textContent ?? '').trim()
        if (text === title || READING_TIME.test(text)) el.remove()
      }
      // A meta row rendered inside the body (timestamp, view count) is interface.
      for (const el of [...body.querySelectorAll('div, section, p')]) {
        if (!el.querySelector('time') || el.querySelector('p, pre, ol, ul, table, figure, blockquote, article, h1, h2, h3, h4, h5, h6, img, video, audio')) continue
        el.remove()
      }
      // Section headings shift so the article title stays the only top level
      // and relative depth is kept (capture.md §3.2).
      const headings = [...body.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      const minimum = Math.min(...headings.map(el => Number(el.tagName.slice(1))))
      for (const el of headings) {
        const normalized = doc.createElement(`h${Math.min(6, Number(el.tagName.slice(1)) - minimum + 2)}`)
        normalized.append(...el.childNodes)
        el.replaceWith(normalized)
      }
      // The cover is the lead picture the author chose: a media image the read
      // region doesn't hold (the rich editor keeps it in the tweet cell), else
      // the read region's first. It follows the title (download.md §4.3).
      const outside = [...article.querySelectorAll('img')].filter(img => own(img) && !longRoot.contains(img))
      const coverSrc = [...outside, ...longRoot.querySelectorAll('img')].map(img => resolveImageSource(img, doc.baseURI)).find(src => src && /\/media\//.test(src))
      const h1 = doc.createElement('h1')
      h1.textContent = title
      output.append(h1)
      if (coverSrc) {
        const copy = [...body.querySelectorAll('img')].find(img => resolveImageSource(img, doc.baseURI) === coverSrc)
        if (copy) {
          copy.remove()
          output.append(copy)
        }
      }
      output.append(body)
      return { element: output, sourceUrl: url.href, meta: { title, author: [`${name} (@${handle})`], ...(published ? { published } : {}) } }
    }
  }
  const candidates = [...article.querySelectorAll('div, p')].filter(
    el =>
      own(el) &&
      !cards.some(card => card.contains(el)) &&
      /^(pre-wrap|pre-line|break-spaces)$/.test(doc.defaultView?.getComputedStyle(el).whiteSpace ?? '') &&
      !el.closest('button, [role="button"]') &&
      // The meta row shares the text containers of a body: the timestamp's date
      // lives in the byline, view counts and quote listings are interface.
      !el.querySelector('time') &&
      ![...el.querySelectorAll('a[href]')].some(link => isEngagementLink(link, doc.baseURI)) &&
      !(el.closest('a[href]') && isEngagementLink(el.closest('a[href]'), doc.baseURI)) &&
      !isInterfaceLeaf(el) &&
      !(el.children.length === 0 && SEPARATOR_ONLY.test((el.textContent ?? '').trim())) &&
      // A quoted card renders its own author rows in text containers; the
      // byline above already carries them (capture.md §3.2).
      (!quoted || ((el.textContent ?? '').trim() !== name && (el.textContent ?? '').trim() !== '@' + handle)),
  )
  const bodies = candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el)))
  const media = [...article.querySelectorAll('img, video')].filter(
    el =>
      own(el) &&
      !cards.some(card => card.contains(el)) &&
      (el.matches('video') || /\/media\//.test(resolveImageSource(el, doc.baseURI) ?? '') || Boolean(el.closest('a[href*="/photo/"]'))),
  )
  if (!bodies.length && !media.length) return undefined
  const byline = doc.createElement('p')
  const strong = doc.createElement('strong')
  strong.textContent = name
  byline.append(strong, ' ')
  const user = doc.createElement('a')
  user.href = `${url.origin}/${handle}`
  user.textContent = `@${handle}`
  byline.append(user)
  if (published) {
    const date = doc.createElement('a')
    date.href = url.href
    date.textContent = published
    byline.append(' · ', date)
  }
  output.append(byline)
  for (const body of bodies) {
    const clone = copyContent(body, doc, url.href, quoted)
    if (clone && cloneHasContent(clone)) {
      const paragraph = doc.createElement('p')
      paragraph.append(...clone.childNodes)
      output.append(paragraph)
    }
  }
  for (const el of media) {
    if (bodies.some(body => body.contains(el))) continue
    const clone = copyContent(el, doc, url.href, quoted)
    if (clone) output.append(clone)
    if (el.matches('video') && !resolveVideoSource(el, doc.baseURI)) {
      const link = doc.createElement('a')
      link.href = url.href
      link.textContent = uiText('capture.sourceVideo')
      const p = doc.createElement('p')
      p.append(link)
      output.append(p)
    }
  }
  for (const link of links) {
    if (bodies.some(body => body.contains(link)) || cards.some(card => card.contains(link)) || link.querySelector('img, time') || !link.textContent?.trim()) continue
    const href = address(link.getAttribute('href'), page.href)
    if (!href || isX(href)) continue
    const p = doc.createElement('p')
    const card = doc.createElement('a')
    card.href = href.href
    card.textContent = link.textContent.trim()
    p.append(card)
    output.append(p)
  }
  if (!quoted) {
    for (const quote of nested) {
      if (bodies.some(body => body.contains(quote))) continue
      const result = extractXContent(quote, pageUrl, true)
      if (result) {
        const block = doc.createElement('blockquote')
        block.append(...result.element.childNodes)
        output.append(block)
      }
    }
    for (const card of cards) {
      const result = extractQuoteCard(card, pageUrl)
      if (result) {
        const block = doc.createElement('blockquote')
        block.append(...result.element.childNodes)
        output.append(block)
      }
    }
  }
  const text = bodies
    .map(body => body.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const excerpt = [...text].slice(0, 40).join('') || match[2]!
  return { element: output, sourceUrl: url.href, meta: { title: `${name} - ${excerpt}`, author: [`${name} (@${handle})`], ...(published ? { published } : {}) } }
}

/**
 * X virtualizes the long-form read view: only the viewport's slice of the
 * body is mounted, so one extraction sees a fragment (Q-27). The download
 * scrolls the page through, collects the rendered blocks in scroll order and
 * reassembles them into a detached copy of the read view, whose anchors —
 * the title region and the rich text body — extraction reads as usual.
 */
export async function collectFullXArticle(doc: Document): Promise<Element | undefined> {
  const readView = doc.querySelector('article[data-testid="twitterArticleReadView"]')
  const richText = readView?.querySelector('[data-testid="twitterArticleRichTextView"]')
  const win = doc.defaultView
  if (!readView || !richText || !win) return undefined
  const column = richText.firstElementChild ?? richText
  const seen = new Set<string>()
  const rendered: Element[] = []
  const gather = (): void => {
    for (const block of [...column.children]) {
      const text = (block.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!text && !block.querySelector('img, video')) continue
      const key = `${text.slice(0, 80)}\n${text.length}\n${block.querySelectorAll('img, video').length}`
      if (seen.has(key)) continue
      seen.add(key)
      rendered.push(block)
    }
  }
  gather()
  // The virtualizer mounts the next window as the page scrolls; X also loads
  // the page's tail lazily, so the bottom can grow while the pass is running.
  // A beat is a MessageChannel turn, not a timer: background tabs throttle
  // timers to seconds, which would stall the pass mid-scroll.
  const beat = (): Promise<void> =>
    new Promise(resolve => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => resolve()
      channel.port2.postMessage(0)
    })
  let stalls = 0
  let top = win.scrollY
  for (let step = 0; step < 400 && stalls < 3; step++) {
    win.scrollBy(0, Math.max(200, Math.round(win.innerHeight * 0.8)))
    await beat()
    gather()
    if (win.scrollY === top) stalls++
    else stalls = 0
    top = win.scrollY
  }
  win.scrollTo(0, 0)
  if (!rendered.length) return undefined
  const assembled = doc.createElement('article')
  for (const name of ['data-testid', 'role']) {
    const value = readView.getAttribute(name)
    if (value) assembled.setAttribute(name, value)
  }
  const title = readView.querySelector('[data-testid="twitter-article-title"]')
  if (title) assembled.append(title.cloneNode(true))
  const body = doc.createElement('div')
  body.setAttribute('data-testid', 'twitterArticleRichTextView')
  for (const block of rendered) body.append(doc.importNode(block, true))
  assembled.append(body)
  return assembled
}
