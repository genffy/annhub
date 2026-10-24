import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PRIVACY_URL, REPO_URL, STORE_URL, TERMS_URL } from '../../website/components/landing/links'
import { getLandingCopy } from '../../website/lib/copy'
import { llmsTxt } from '../../website/lib/llms-txt'
import { MIN_CHROME_VERSION, SITE_ORIGIN } from '../../website/lib/site'
import { faqJsonLd, jsonLdScript, softwareApplicationJsonLd } from '../../website/lib/structured-data'

/**
 * What search engines and AI crawlers read from the website (docs/product/seo-geo.md §3, §5, §6). None of it shows on the page,
 * so neither a type check nor a look at the site catches a regression.
 */

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const origin = /export const SITE_ORIGIN = '([^']+)'/.exec(read('website/lib/site.ts'))?.[1]

describe('robots.txt', () => {
  const robots = read('website/public/robots.txt')

  it('opens every page to every crawler', () => {
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Allow: \/$/m)
    expect(robots).not.toMatch(/^Disallow:/im)
  })

  it('allows search, AI answers and AI training in its content signals', () => {
    expect(robots).toMatch(/^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m)
  })

  it('points at the sitemap on the production origin', () => {
    expect(origin).toBe('https://annhub.org')
    expect(robots).toMatch(new RegExp(`^Sitemap: ${origin}/sitemap\\.xml$`, 'm'))
  })
})

describe('language versions', () => {
  it('declares both languages and an English fallback in the HTML', () => {
    const layout = read('website/app/[locale]/layout.tsx')
    expect(layout).toMatch(/'x-default': '\/en'/)
    expect(layout).toContain("'zh-CN': '/zh-CN'")
    expect(layout).toContain("'en': '/en'")
  })
})

describe('structured data', () => {
  for (const locale of ['en', 'zh-CN']) {
    const copy = getLandingCopy(locale)

    it(`describes the extension in the ${locale} page's own words, with the store listing (§5.2)`, () => {
      const app = softwareApplicationJsonLd(copy)
      expect(app).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        'name': 'AnnHub',
        'description': copy.meta.description,
        'applicationCategory': 'BrowserApplication',
        'url': STORE_URL,
        'installUrl': STORE_URL,
        'sameAs': [STORE_URL, REPO_URL],
      })
      expect(app.operatingSystem).toContain(`Chromium ${MIN_CHROME_VERSION} `)
      expect(app.operatingSystem).not.toMatch(/[{}]/)
    })

    it(`claims no price, rating or review on the ${locale} page`, () => {
      const markup = JSON.stringify(softwareApplicationJsonLd(copy))
      for (const property of ['offers', 'aggregateRating', 'review']) expect(markup).not.toContain(`"${property}"`)
    })

    it(`answers with the ${locale} page's FAQ (§5.1)`, () => {
      const faq = faqJsonLd(copy)
      expect(faq['@type']).toBe('FAQPage')
      expect(faq.mainEntity.map(question => question.name)).toEqual(copy.faq.items.map(item => item.q))
      expect(JSON.stringify(faq)).not.toContain('`')
    })
  }

  it('cannot end its script element early', () => {
    const script = jsonLdScript({ text: '</script><script>alert(1)</script>' })
    expect(script.__html).not.toContain('<')
    expect(JSON.parse(script.__html)).toEqual({ text: '</script><script>alert(1)</script>' })
  })
})

describe('llms.txt', () => {
  const text = llmsTxt()
  const en = getLandingCopy('en')
  const [details = '', ...sections] = text.split(/^(?=## )/m)

  it('opens with the name and the English page description, as the proposal asks (§5.4)', () => {
    expect(text.startsWith(`# AnnHub\n\n> ${en.meta.description}\n\n`)).toBe(true)
    expect(text.match(/^# /gm)).toHaveLength(1)
  })

  it('says who it is for, where the data lives and the deliberate choices in the English page’s words, without headings', () => {
    expect(details).toContain(en.hero.audience)
    expect(details).toContain(en.trust.body)
    for (const item of en.diff.items) expect(details).toContain(`- ${item.title}: ${item.body}`)
    expect(details.match(/^#/gm)).toHaveLength(1)
  })

  it('is English', () => {
    expect(text).not.toMatch(/[\u3000-\u9fff\uff00-\uffef]/)
  })

  it('links the two language pages, the store listing, GitHub and the two legal pages, by absolute address', () => {
    expect(sections.length).toBeGreaterThan(1)
    for (const section of sections) expect(section).toMatch(/^## .+\n\n(- \[[^\]]+\]\(https:\/\/[^)\s]+\)\n)+\n?$/)
    const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1])
    expect(links.sort()).toEqual([`${SITE_ORIGIN}/en`, `${SITE_ORIGIN}/zh-CN`, STORE_URL, REPO_URL, `${SITE_ORIGIN}${PRIVACY_URL}`, `${SITE_ORIGIN}${TERMS_URL}`].sort())
  })
})
