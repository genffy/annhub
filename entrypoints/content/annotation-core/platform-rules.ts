import type { AnnotationIntent, AnnotationPlatformRule, ContentSource } from './types'

export const TWEET_STATUS_RE = /^\/[^/]+\/status\/\d+$/
export const TWEET_STATUS_PREFIX_RE = /^\/[^/]+\/status\/\d+/

const TWITTER_HOST_WITH_SUBDOMAIN_RE = /(^|\.)((x\.com)|(twitter\.com))$/i
const X_TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]'
const X_TWEET_CONTAINER_SELECTOR = 'article, [data-testid="tweet"]'

type TwitterStatusHref = {
  url: string
  path: string
  isExact: boolean
}

function isXHost(hostname: string): boolean {
  return TWITTER_HOST_WITH_SUBDOMAIN_RE.test(hostname)
}

function uniqueElements(elements: Element[]): Element[] {
  const seen = new Set<Element>()
  const result: Element[] = []

  for (const el of elements) {
    if (!el.isConnected || seen.has(el)) continue
    seen.add(el)
    result.push(el)
  }

  return result
}

function getHref(el: Element): string | null {
  return el instanceof HTMLAnchorElement ? el.getAttribute('href') || el.href : null
}

function parseTwitterStatusHref(href: string | null | undefined, origin: string): TwitterStatusHref | null {
  if (!href) return null

  try {
    const url = new URL(href, origin)
    // Use the same subdomain-aware host check as the platform-rule matcher (isXHost),
    // so permalink parsing works on every host the rule activates for (e.g. mobile.*),
    // instead of silently rejecting links on subdomains.
    if (!isXHost(url.hostname)) return null

    const match = url.pathname.match(TWEET_STATUS_PREFIX_RE)
    if (!match) return null

    return {
      url: `${origin}${match[0]}`,
      path: match[0],
      isExact: TWEET_STATUS_RE.test(url.pathname),
    }
  } catch {
    return null
  }
}

function getTwitterStatusLinks(container: Element, origin: string): TwitterStatusHref[] {
  const links: Element[] = []
  if (container instanceof HTMLAnchorElement) links.push(container)
  links.push(...Array.from(container.querySelectorAll('a[href]')))

  return links.map(link => parseTwitterStatusHref(getHref(link), origin)).filter((item): item is TwitterStatusHref => Boolean(item))
}

export function extractTwitterPermalink(container: Element, origin: string): string | null {
  const timeEl = container.querySelector('time')
  if (timeEl) {
    const timeLink = timeEl.closest('a[href]') as HTMLAnchorElement | null
    if (timeLink) {
      const status = parseTwitterStatusHref(getHref(timeLink), origin)
      if (status) return status.url
    }
  }

  let fallback: string | null = null

  for (const status of getTwitterStatusLinks(container, origin)) {
    if (status.isExact) return status.url
    if (!fallback) fallback = status.url
  }
  return fallback
}

export function findTwitterPermalinkContainer(startElement: Element, origin: string): Element | null {
  let el: Element | null = startElement

  while (el && el !== document.body) {
    const ownStatus = parseTwitterStatusHref(getHref(el), origin)
    if (ownStatus) return el

    const role = el.getAttribute('role')
    const isTweetBoundary = el.matches(X_TWEET_CONTAINER_SELECTOR)
    const isQuotedTweetCard = role === 'link'

    if ((isQuotedTweetCard || isTweetBoundary) && extractTwitterPermalink(el, origin)) {
      return el
    }

    if (isTweetBoundary) break
    el = el.parentElement
  }

  return null
}

export function findTwitterContainerByPermalink(sourceUrl: string, origin: string): Element | null {
  const target = parseTwitterStatusHref(sourceUrl, origin)
  if (!target) return null

  const links = Array.from(document.querySelectorAll('a[href]'))

  for (const link of links) {
    const status = parseTwitterStatusHref(getHref(link), origin)
    if (!status || status.path !== target.path) continue

    let el: Element | null = link
    while (el && el !== document.body) {
      if (el.getAttribute('role') === 'link') return el
      if (el.matches(X_TWEET_CONTAINER_SELECTOR)) return el
      el = el.parentElement
    }

    return link
  }

  return null
}

function collectXContentBlocks(root: Element, _intent: AnnotationIntent): Element[] {
  const candidates: Element[] = []
  const closestTweetText = root.closest(X_TWEET_TEXT_SELECTOR)

  if (closestTweetText) {
    candidates.push(closestTweetText)
  }

  if (root.matches(X_TWEET_TEXT_SELECTOR)) {
    candidates.push(root)
  }

  candidates.push(...Array.from(root.querySelectorAll(X_TWEET_TEXT_SELECTOR)))
  return uniqueElements(candidates)
}

const X_PLATFORM_RULE: AnnotationPlatformRule = {
  name: 'x',
  match: url => isXHost(url.hostname),
  resolveRoot: () => document.querySelector('main') ?? document.body,
  collectContentBlocks: collectXContentBlocks,
  findSourceFromElement: (element, origin): ContentSource => {
    const container = findTwitterPermalinkContainer(element, origin)
    return {
      container,
      sourceUrl: container ? extractTwitterPermalink(container, origin) : null,
    }
  },
  findContainerBySourceUrl: findTwitterContainerByPermalink,
}

const PLATFORM_RULES: AnnotationPlatformRule[] = [X_PLATFORM_RULE]

export function getActiveAnnotationPlatformRule(url = new URL(window.location.href)): AnnotationPlatformRule | null {
  return PLATFORM_RULES.find(rule => rule.match(url)) ?? null
}
