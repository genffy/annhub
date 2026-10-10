import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MetadataRoute } from 'next'
import { PRIVACY_URL, TERMS_URL } from '@/components/landing/links'
import { i18n } from '@/i18n/config'
import { getLandingCopy } from '@/lib/copy'
import { SITE_ORIGIN } from '@/lib/site'

/**
 * The four canonical addresses: both language pages and both legal pages (docs/v2/seo-geo.md §3.5). lastmod is the day
 * the content last changed, never the build time; no alternates, no priority, no changefreq.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...i18n.locales.map(locale => ({ url: `${SITE_ORIGIN}/${locale}`, lastModified: getLandingCopy(locale).meta.updated })),
    ...[PRIVACY_URL, TERMS_URL].map(path => ({ url: `${SITE_ORIGIN}${path}`, lastModified: legalPageUpdated(path) })),
  ]
}

/** The date a legal page in public/ states as its last update, YYYY-MM-DD. */
function legalPageUpdated(path: string): string {
  const html = readFileSync(join(process.cwd(), 'public', path), 'utf8')
  const match = /最后更新：(\d{4}) 年 (\d{1,2}) 月 (\d{1,2}) 日/.exec(html)
  if (!match) throw new Error(`${path} states no last-updated date`)
  const [, year, month, day] = match
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
}
