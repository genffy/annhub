import { SITE_ORIGIN } from '../website/lib/site.ts'
import { ASKED_COUNTRIES, REGION_COOKIE, REGION_OUTSIDE } from '../website/lib/consent.ts'
import { LANGUAGE_TARGET } from '../scripts/website-static.mjs'

export const RULE_PREFIX = 'annhub_static_'
const hostname = new URL(SITE_ORIGIN).hostname
const host = `http.host eq "${hostname}"`
const language = 'lower(http.request.accepted_languages[0])'
const chinese = `(${language} eq "zh" or starts_with(${language}, "zh-"))`
const saved = locale => `any(http.request.cookies["NEXT_LOCALE"][*] eq "${locale}")`
const page = locale => `(http.request.uri.path in {"/${locale}" "/${locale}.html"})`
const headers = (ref, description, expression, values) => ({
  ref: `${RULE_PREFIX}${ref}`,
  description,
  expression: `(${host} and ${expression})`,
  action: 'rewrite',
  action_parameters: { headers: values },
  enabled: true,
})

/** Zone Transform Rules run without a Worker script. No paid regex operators or geolocation endpoint. */
export function siteRules({ analytics = true } = {}) {
  const asked = [...new Set([...ASKED_COUNTRIES, '', 'XX', 'T1'])]
    .sort()
    .map(country => JSON.stringify(country))
    .join(' ')
  return {
    http_request_dynamic_redirect: [
      {
        ref: `${RULE_PREFIX}canonical_host`,
        description: 'AnnHub: canonical hostname',
        expression: `(http.host eq "www.${hostname}")`,
        action: 'redirect',
        action_parameters: { from_value: { status_code: 301, target_url: { expression: `concat("${SITE_ORIGIN}", http.request.uri.path)` }, preserve_query_string: true } },
        enabled: true,
      },
    ],
    http_request_transform: [
      {
        ref: `${RULE_PREFIX}root_chinese`,
        description: 'AnnHub: Chinese root redirect, honoring the saved language',
        expression: `(${host} and http.request.uri.path eq "/" and (${saved('zh-CN')} or (not ${saved('en')} and ${chinese})))`,
        action: 'rewrite',
        action_parameters: { uri: { path: { value: LANGUAGE_TARGET } } },
        enabled: true,
      },
    ],
    http_response_headers_transform: [
      headers('root_cache', 'AnnHub: do not cache a personal language redirect', 'raw.http.request.uri.path eq "/"', {
        'cache-control': { operation: 'set', value: 'private, no-store' },
      }),
      ...(analytics
        ? [
            headers(
              'region',
              'AnnHub: analytics default outside the consent countries',
              `(${page('en')} or ${page('zh-CN')}) and len(ip.src.country) eq 2 and not ip.src.country in {${asked}}`,
              {
                'set-cookie': { operation: 'set', value: `${REGION_COOKIE}=${REGION_OUTSIDE}; Path=/; SameSite=Lax; Secure` },
              },
            ),
          ]
        : []),
      ...['en', 'zh-CN'].map(locale =>
        headers(
          `language_${locale.replace('-', '_')}`,
          `AnnHub: remember an explicit ${locale} language choice`,
          `${page(locale)} and not ${saved(locale)} and (${saved(locale === 'en' ? 'zh-CN' : 'en')} or ${locale === 'en' ? chinese : `not ${chinese}`})`,
          {
            'set-cookie': { operation: 'add', value: `NEXT_LOCALE=${locale}; Path=/; SameSite=Lax; Secure` },
          },
        ),
      ),
    ],
  }
}
