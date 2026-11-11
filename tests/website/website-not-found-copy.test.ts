import { describe, expect, it } from 'vitest'
import { getLandingCopy } from '../../website/lib/copy'

describe('the 404 page copy', () => {
  it('is complete in both languages and each is in its own script', () => {
    const copies = { zh: getLandingCopy('zh-CN').notFound, en: getLandingCopy('en').notFound }
    expect(copies.zh, 'zh-CN notFound').toBeDefined()
    expect(copies.en, 'en notFound').toBeDefined()
    expect(Object.keys(copies.zh).sort()).toEqual(Object.keys(copies.en).sort())
    for (const text of Object.values(copies.zh)) expect(text).toMatch(/\p{Script=Han}/u)
    for (const text of Object.values(copies.en)) expect(text).not.toMatch(/\p{Script=Han}/u)
  })
})
