import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { i18n } from './i18n/config'
import { REGION_COOKIE, REGION_OUTSIDE, regionCookie } from './lib/consent'
import { ANALYTICS_TOKEN } from './lib/site'

// Next.js 16 calls this file convention `proxy`. Every page lives under its locale prefix; `/` goes to the browser's
// language, and to English when that is neither Chinese nor English. Language versions are declared once, in the HTML,
// so the middleware adds no `Link` header with a second copy (docs/v2/seo-geo.md §3.2).
const intl = createMiddleware({
  locales: i18n.locales,
  defaultLocale: i18n.defaultLocale,
  alternateLinks: false,
})

export default function proxy(request: NextRequest) {
  const response = intl(request)
  if (!ANALYTICS_TOKEN) return response
  // The pages are static and cannot see where a visitor is; Cloudflare's CF-IPCountry header can. Outside the asked
  // countries a session cookie tells the page it may count without asking; anyone else gets no cookie and is asked
  // first (docs/v2/permissions.md §8).
  const action = regionCookie(request.headers.get('cf-ipcountry'), request.cookies.get(REGION_COOKIE)?.value)
  if (action === 'set') response.cookies.set(REGION_COOKIE, REGION_OUTSIDE, { path: '/', sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' })
  else if (action === 'delete') response.cookies.delete({ name: REGION_COOKIE, path: '/' })
  return response
}

export const config = {
  // Skip paths that are not pages: API, build output, the static legal pages and anything with a file extension.
  matcher: ['/((?!api|_next|privacy-policy/?$|terms-of-service/?$|.*\\..*).*)'],
}
