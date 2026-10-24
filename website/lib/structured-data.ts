// Relative, not '@/': the root tests import this file, and their '@' is the repository root.
import { REPO_URL, STORE_URL } from '../components/landing/links'
import { fill, type LandingCopy } from './copy'
import { MIN_CHROME_VERSION } from './site'

// The semantic layer for search engines and AI tools (docs/product/seo-geo.md §5). Every word comes from the page's copy, so
// the markup changes with the page and never says more than the page does.

/** The page's FAQ (§5.1), including the date a competitor description was checked; backticks are RichText markup, not visible characters. */
export function faqJsonLd(copy: LandingCopy) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': copy.faq.items.map(item => ({
      '@type': 'Question',
      'name': item.q,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': [item.a, item.note].filter(Boolean).join(' ').replace(/`/g, ''),
      },
    })),
  }
}

/**
 * What AnnHub is and where to install it (§5.2). Google's software rich result also wants a price and ratings; there are none to
 * give, so this stays a semantic layer without offers, aggregateRating or review.
 */
export function softwareApplicationJsonLd(copy: LandingCopy) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': 'AnnHub',
    'description': copy.meta.description,
    'applicationCategory': 'BrowserApplication',
    'operatingSystem': fill(copy.meta.operatingSystem, { version: MIN_CHROME_VERSION }),
    'url': STORE_URL,
    'installUrl': STORE_URL,
    'sameAs': [STORE_URL, REPO_URL],
  }
}

/** The contents of a `<script type="application/ld+json">`: `<` is escaped so no text can end the element early. */
export function jsonLdScript(value: object): { __html: string } {
  return { __html: JSON.stringify(value).replace(/</g, '\\u003c') }
}
