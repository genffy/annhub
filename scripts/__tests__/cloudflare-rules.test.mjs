// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { syncRules, zoneApi } from '../cloudflare-rules.mjs'
import { siteRules } from '../../cloudflare/site-rules.mjs'

describe('Cloudflare rule synchronization', () => {
  it('plans missing phases without writing anything', async () => {
    const api = vi.fn().mockResolvedValue(null)
    const changes = await syncRules({ api, desired: siteRules() })
    expect(changes).toHaveLength(3)
    expect(api.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })

  it('updates its rules in order, removes obsolete owned rules and preserves other rules', async () => {
    const desired = { http_response_headers_transform: siteRules().http_response_headers_transform }
    const foreign = { id: 'foreign', ref: 'another_site', action: 'rewrite', expression: 'true', enabled: true }
    const state = {
      id: 'phase',
      rules: [foreign, { ...desired.http_response_headers_transform[0], id: 'old', action_parameters: {} }, { id: 'obsolete', ref: 'annhub_static_obsolete' }],
    }
    let nextId = 0
    const api = vi.fn(async (method, path, body) => {
      if (method === 'GET') return structuredClone(state)
      const id = path.split('/').at(-1)
      if (method === 'DELETE') state.rules = state.rules.filter(rule => rule.id !== id)
      else {
        const { position, ...fields } = body
        const updated = { ...fields, id: method === 'PATCH' ? id : `new-${nextId++}` }
        state.rules = state.rules.filter(rule => rule.id !== updated.id)
        state.rules.splice(position.index - 1, 0, updated)
      }
      return structuredClone(state)
    })
    await syncRules({ api, desired, apply: true })
    expect(state.rules.slice(0, -1).map(rule => rule.ref)).toEqual(desired.http_response_headers_transform.map(rule => rule.ref))
    expect(state.rules.at(-1)).toEqual(foreign)
    expect(api.mock.calls.some(([method, path]) => method !== 'GET' && path.endsWith('/foreign'))).toBe(false)
    api.mockClear()
    expect(await syncRules({ api, desired, apply: true })).toEqual([])
    expect(api.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })

  it('creates the correct phase once when no entrypoint exists', async () => {
    const api = vi.fn().mockResolvedValue(null)
    const desired = { http_request_transform: siteRules().http_request_transform }
    await syncRules({ api, desired, apply: true })
    expect(api).toHaveBeenCalledWith('POST', '/rulesets', { name: 'AnnHub website rules', kind: 'zone', phase: 'http_request_transform', rules: desired.http_request_transform })
  })

  it('stops on an API error before applying later rules', async () => {
    const api = vi.fn().mockRejectedValue(new Error('Permission denied'))
    await expect(syncRules({ api, desired: siteRules(), apply: true })).rejects.toThrow('Permission denied')
    expect(api).toHaveBeenCalledTimes(1)
  })
})

describe('Cloudflare API errors', () => {
  const zoneId = 'a'.repeat(32)
  it('treats only a missing entrypoint as an absent ruleset', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10003 }] }), { status: 404 }))
    const api = zoneApi({ token: 'test-secret', zoneId, fetcher })
    expect(await api('GET', '/rulesets/phases/test/entrypoint', undefined, true)).toBeNull()
    await expect(api('GET', '/rulesets/phases/test/entrypoint')).rejects.toThrow('HTTP 404')
    fetcher.mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ code: 7003 }] }), { status: 404 }))
    await expect(api('GET', '/rulesets/phases/test/entrypoint', undefined, true)).rejects.toThrow('HTTP 404')
  })

  it('never logs the token or arbitrary response content in an authentication error', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'test-secret' }] }), { status: 403 }))
    const api = zoneApi({ token: 'test-secret', zoneId, fetcher })
    await expect(api('GET', '/rulesets')).rejects.toThrow('HTTP 403, error code(s) 10000')
  })
})
