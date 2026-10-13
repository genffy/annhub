import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * What search engines and AI crawlers read from the website (docs/v2/seo-geo.md §3, §6). None of it shows on the page,
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
