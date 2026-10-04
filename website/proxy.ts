import createMiddleware from 'next-intl/middleware'

// Next.js 16 calls this file convention `proxy`. Every page lives under its locale prefix.
export default createMiddleware({
  locales: ['en', 'zh-CN'],
  defaultLocale: 'zh-CN',
})

export const config = {
  // Skip paths that are not pages: API, build output, the static legal pages and anything with a file extension.
  matcher: ['/((?!api|_next|privacy-policy/?$|terms-of-service/?$|.*\\..*).*)'],
}
