import createMiddleware from 'next-intl/middleware'
import { i18n } from './i18n/config'

// Next.js 16 calls this file convention `proxy`. Every page lives under its locale prefix; `/` goes to the browser's
// language, and to English when that is neither Chinese nor English. Language versions are declared once, in the HTML,
// so the middleware adds no `Link` header with a second copy (docs/v2/seo-geo.md §3.2).
export default createMiddleware({
  locales: i18n.locales,
  defaultLocale: i18n.defaultLocale,
  alternateLinks: false,
})

export const config = {
  // Skip paths that are not pages: API, build output, the static legal pages and anything with a file extension.
  matcher: ['/((?!api|_next|privacy-policy/?$|terms-of-service/?$|.*\\..*).*)'],
}
