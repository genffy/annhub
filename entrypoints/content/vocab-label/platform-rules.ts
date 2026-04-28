export interface VocabPlatformRule {
  name: string
  match: (hostname: string) => boolean
  resolveContentRoot?: () => Element | null
  collectBlocks: (root: Element) => Element[]
}

function isXHost(hostname: string): boolean {
  return hostname === 'x.com' || hostname.endsWith('.x.com')
    || hostname === 'twitter.com' || hostname.endsWith('.twitter.com')
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

const X_TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]'

const X_PLATFORM_RULE: VocabPlatformRule = {
  name: 'x',
  match: isXHost,
  resolveContentRoot: () => document.querySelector('main') ?? document.body,
  collectBlocks: root => {
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
  },
}

const PLATFORM_RULES: VocabPlatformRule[] = [
  X_PLATFORM_RULE,
]

export function getActivePlatformRule(hostname = window.location.hostname): VocabPlatformRule | null {
  return PLATFORM_RULES.find(rule => rule.match(hostname)) ?? null
}
