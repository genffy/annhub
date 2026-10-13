import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { RULE_PREFIX, siteRules } from '../cloudflare/site-rules.mjs'

/** Update only this site's named rules, leaving other zone rules in place. Request/response phases stay ordered. */
export async function syncRules({ api, desired, apply = false }) {
  const changes = []
  for (const [phase, rules] of Object.entries(desired)) {
    const entrypoint = await api('GET', `/rulesets/phases/${phase}/entrypoint`, undefined, true)
    if (!entrypoint) {
      changes.push(`Create ${phase}: ${rules.length} AnnHub rules`)
      if (apply) await api('POST', '/rulesets', { name: 'AnnHub website rules', kind: 'zone', phase, rules })
      continue
    }
    let current = [...(entrypoint.rules ?? [])]
    // A stable ref owns a rule. Never remove or rewrite another application's rules, even in the same phase.
    for (const rule of current.filter(rule => rule.ref?.startsWith(RULE_PREFIX) && !rules.some(wanted => wanted.ref === rule.ref))) {
      changes.push(`Delete obsolete ${rule.ref}`)
      if (apply) await api('DELETE', `/rulesets/${entrypoint.id}/rules/${rule.id}`)
      current = current.filter(candidate => candidate.id !== rule.id)
    }
    for (const [index, rule] of rules.entries()) {
      const found = current.find(candidate => candidate.ref === rule.ref)
      const fields = found && Object.fromEntries(Object.keys(rule).map(key => [key, found[key]]))
      const unchanged = fields && isDeepStrictEqual(fields, rule) && current[index]?.id === found.id
      if (unchanged) continue
      changes.push(`${found ? 'Update' : 'Create'} ${rule.ref}`)
      if (!apply) continue
      const path = `/rulesets/${entrypoint.id}/rules${found ? `/${found.id}` : ''}`
      const result = await api(found ? 'PATCH' : 'POST', path, { ...rule, position: { index: index + 1 } })
      current = result.rules
      if (!Array.isArray(current)) throw new Error('Cloudflare did not return the updated ruleset')
    }
  }
  return changes
}

export function zoneApi({ token, zoneId, fetcher = fetch }) {
  if (!token || !/^[a-f0-9]{32}$/.test(zoneId ?? '')) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required')
  return async (method, path, body, allowMissing = false) => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/zones/${zoneId}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await response.json()
    // Only the documented absent-entrypoint error may create a new ruleset. An unknown zone or a permissions error
    // must stop deployment, not look like an empty configuration.
    if (allowMissing && response.status === 404 && data.errors?.some(error => error.code === 10003)) return null
    if (!response.ok || !data.success) {
      const codes = data.errors?.map(error => error.code).join(', ') ?? 'unknown'
      throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}, error code(s) ${codes}`)
    }
    return data.result
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.some(arg => !['--apply', '--print'].includes(arg))) throw new Error('Usage: node scripts/cloudflare-rules.mjs [--print | --apply]')
  const production = JSON.parse(readFileSync(new URL('../cloudflare/production.json', import.meta.url), 'utf8'))
  const desired = siteRules({ analytics: Boolean(production.NEXT_PUBLIC_CF_BEACON_TOKEN) })
  if (args.includes('--print')) console.log(JSON.stringify(desired, null, 2))
  else {
    const apply = args.includes('--apply')
    const api = zoneApi({ token: process.env.CLOUDFLARE_API_TOKEN, zoneId: process.env.CLOUDFLARE_ZONE_ID })
    const changes = await syncRules({ api, desired, apply })
    console.log(changes.join('\n') || 'AnnHub rules are already up to date.')
    if (!apply) console.log('Dry run only. Pass --apply to update these rules.')
  }
}
