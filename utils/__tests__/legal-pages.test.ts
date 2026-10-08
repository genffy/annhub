import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The public privacy policy and terms are what the store listing links to. They
 * once described a highlighter with Logseq sync after the product had moved on.
 * These checks keep them tied to the manifest and free of removed features.
 */

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const privacy = read('website/public/privacy-policy.html')
const terms = read('website/public/terms-of-service.html')

function manifestPermissions(): { permissions: string[]; hosts: string[] } {
  const config = read('wxt.config.ts')
  const list = (key: string) => {
    const match = new RegExp(`(?<![_a-z])${key}:\\s*\\[([^\\]]*)\\]`).exec(config)
    if (!match) throw new Error(`wxt.config.ts has no ${key} list`)
    return [...match[1]!.matchAll(/'([^']+)'/g)].map(entry => entry[1]!)
  }
  return { permissions: list('permissions'), hosts: list('host_permissions') }
}

describe('privacy policy', () => {
  it('explains every permission the manifest requests', () => {
    const { permissions, hosts } = manifestPermissions()
    expect(permissions.length).toBeGreaterThan(0)
    for (const permission of permissions) expect(privacy, permission).toContain(`<code>${permission}</code>`)
    for (const host of hosts) {
      if (host === '<all_urls>') expect(privacy).toContain('&lt;all_urls&gt;')
      else expect(privacy, host).toContain(new URL(host.replace('/*', '')).host)
    }
  })

  it('does not claim permissions the manifest no longer asks for', () => {
    const { permissions } = manifestPermissions()
    for (const [, name] of privacy.matchAll(/<tr><td><code>([a-zA-Z]+)<\/code>/g)) {
      expect(permissions, `${name} is described but not requested`).toContain(name)
    }
  })

  it('states the data flows of the current product', () => {
    expect(privacy).toMatch(/local library|本地资料库/i)
    expect(privacy).toMatch(/IndexedDB/)
    expect(privacy).toMatch(/the only outbound request|唯一会产生的出站请求/i)
    expect(privacy).toContain('Limited Use')
  })
})

describe('legal pages', () => {
  it.each([
    ['privacy policy', privacy],
    ['terms of service', terms],
  ])('%s has no removed feature and ships both languages', (_name, page) => {
    // None of these is in docs/v2; a policy that mentions one describes a product that no longer exists.
    expect(page).not.toMatch(
      /logseq|eudic|欧路|vocabulary|词汇|词表|side panel|sidepanel|侧边栏|Mode [AB]\b|macOS|Mac app|Mac 应用|Desktop|127\.0\.0\.1|pairing code|配对码|knowledge fragment|知识碎片|language-model|语言模型|API key|API 密钥/i,
    )
    expect(page).toContain('lang="en" id="en"')
    expect(page).toContain('lang="zh-CN" id="zh"')
  })

  it('carry the same last-updated date in both languages and across both pages', () => {
    const dates = [privacy, terms].map(page => [...page.matchAll(/Last updated: ([A-Za-z]+ \d+, \d{4})/g)].map(match => match[1]))
    expect(new Set(dates.flat()).size).toBe(1)
    const zh = [privacy, terms].map(page => [...page.matchAll(/最后更新：(\d{4}) 年 (\d+) 月 (\d+) 日/g)].map(match => match.slice(1).join('-')))
    expect(new Set(zh.flat()).size).toBe(1)
  })
})
