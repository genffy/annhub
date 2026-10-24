// Relative, not '@/': the root tests import this file, and their '@' is the repository root.
import { PRIVACY_URL, REPO_URL, STORE_URL, TERMS_URL } from '../components/landing/links'
import { getLandingCopy } from './copy'
import { SITE_ORIGIN } from './site'

/**
 * /llms.txt for the AI tools that read it (docs/product/seo-geo.md §5.4), in the proposal's shape: the name, the English page's
 * description as the summary, then who it is for, where the data lives and the deliberate choices, all in the English page's own
 * words, and finally absolute links grouped under H2s. Built from the copy, so it changes with the page.
 */
export function llmsTxt(): string {
  const { meta, hero, trust, diff, footer } = getLandingCopy('en')
  const link = (label: string, url: string) => `- [${label}](${url})`
  return (
    [
      '# AnnHub',
      `> ${meta.description}`,
      `${hero.audience}.`,
      trust.body,
      [`${diff.title}:`, '', ...diff.items.map(item => `- ${item.title}: ${item.body}`)].join('\n'),
      ['## Website', '', link('English', `${SITE_ORIGIN}/en`), link('Simplified Chinese', `${SITE_ORIGIN}/zh-CN`)].join('\n'),
      ['## Install', '', link(footer.store, STORE_URL)].join('\n'),
      ['## Source', '', link(footer.github, REPO_URL)].join('\n'),
      ['## Policies', '', link(footer.privacy, `${SITE_ORIGIN}${PRIVACY_URL}`), link(footer.terms, `${SITE_ORIGIN}${TERMS_URL}`)].join('\n'),
    ].join('\n\n') + '\n'
  )
}
