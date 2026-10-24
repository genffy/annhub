// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { smokeWebsite, waitForRevision } from '../smoke-website.mjs'

const OLD = 'a'.repeat(40)
const NEW = 'b'.repeat(40)

/** `/__deployment.json` answering with each report in turn, then the last one forever: a revision, an HTTP status or a thrown error. */
function deployments(...reports) {
  return vi.fn(async url => {
    expect(new URL(url).pathname).toBe('/__deployment.json')
    const report = reports.length > 1 ? reports.shift() : reports[0]
    if (report instanceof Error) throw report
    if (typeof report === 'number') return new Response('', { status: report })
    return new Response(JSON.stringify({ revision: report }), { status: 200 })
  })
}

/** A clock that moves only while the wait sleeps. */
function clock() {
  let time = 0
  return {
    now: () => time,
    sleep: vi.fn(async ms => {
      time += ms
    }),
  }
}

describe('waiting for a deployment to settle', () => {
  it('returns once the new revision has been reported on consecutive reads', async () => {
    const fetcher = deployments(OLD, NEW, OLD, NEW, NEW, NEW)
    const { now, sleep } = clock()
    await waitForRevision({ origin: 'https://annhub.org', revision: NEW, fetcher, reads: 3, interval: 1_000, now, sleep })
    expect(fetcher).toHaveBeenCalledTimes(6)
    expect(sleep).toHaveBeenCalledTimes(5)
    expect(sleep).toHaveBeenCalledWith(1_000)
  })

  it('counts an error or a failed response as not settled', async () => {
    const fetcher = deployments(new TypeError('fetch failed'), 503, NEW)
    const { now, sleep } = clock()
    await waitForRevision({ origin: 'https://annhub.org', revision: NEW, fetcher, reads: 2, interval: 1_000, now, sleep })
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('fails with what the site last reported when it never settles', async () => {
    const fetcher = deployments(OLD)
    const { now, sleep } = clock()
    await expect(waitForRevision({ origin: 'https://annhub.org', revision: NEW, fetcher, interval: 3_000, timeout: 30_000, now, sleep })).rejects.toThrow(
      `The live site did not settle on ${NEW} within 30 s; it last reported ${OLD}`,
    )
    expect(fetcher).toHaveBeenCalledTimes(11)
  })
})

describe('the smoke check', () => {
  it('waits for the deployed revision before its first assertion', async () => {
    const fetcher = deployments(OLD)
    const { now, sleep } = clock()
    await expect(smokeWebsite({ origin: 'https://annhub.org', revision: NEW, fetcher, settle: { timeout: 0, now, sleep } })).rejects.toThrow('did not settle')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('asserts the revision at once when there is no rollout to wait for', async () => {
    const fetcher = deployments(OLD)
    await expect(smokeWebsite({ origin: 'http://localhost:3001', revision: NEW, fetcher, settle: false })).rejects.toThrow('The live site is not the commit just deployed')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
