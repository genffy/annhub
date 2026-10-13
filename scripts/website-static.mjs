import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REGION_COOKIE } from '../website/lib/consent.ts'

export const websiteOutput = resolve(dirname(fileURLToPath(import.meta.url)), '../website/out')
export const LANGUAGE_TARGET = '/__annhub/language/zh-CN'

/** Static Assets handles the aliases; URL Transform Rules send Chinese root requests to LANGUAGE_TARGET. */
export function staticRedirects() {
  return [
    '/ /en 302',
    `${LANGUAGE_TARGET} /zh-CN 302`,
    ...['en', 'zh-CN'].flatMap(locale => [`/${locale}/ /${locale} 301`, `/${locale}.html /${locale} 301`, `/${locale} /${locale}.html 200`]),
    ...['privacy-policy', 'terms-of-service'].flatMap(page => [`/${page}/ /${page} 301`, `/${page} /${page}.html 200`]),
    '',
  ].join('\n')
}

export function staticHeaders({ analytics = false } = {}) {
  return [
    // Fail closed when a preview or an unconfigured domain has no country rule. Production replaces this header
    // outside the asked countries, then appends the language cookie. The HTML itself is identical for everyone.
    ...(analytics ? ['/en', '/en.html', '/zh-CN', '/zh-CN.html'].flatMap(path => [path, `  Set-Cookie: ${REGION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`]) : []),
    '/_next/static/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/__deployment.json',
    '  Cache-Control: no-store',
    '',
  ].join('\n')
}

export function prepareStatic({ directory = websiteOutput, production = false, analytics = false, revision = 'local' } = {}) {
  if (revision !== 'local' && !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid deployment revision')
  const files = {
    '_redirects': staticRedirects(),
    '_headers': staticHeaders({ analytics }),
    '__deployment.json': `${JSON.stringify({ revision, production, analytics })}\n`,
  }
  for (const [path, contents] of Object.entries(files)) {
    const target = resolve(directory, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, contents)
  }
}
