import { en } from './en'
import type { LandingCopy } from './types'
import { zhCN } from './zh-CN'

export type { LandingCopy, Locale, SectionId, StoryStep } from './types'

/** The page copy for a route locale. Anything that is not zh-CN reads English, like the extension's own interface. */
export function getLandingCopy(locale: string): LandingCopy {
  return locale === 'zh-CN' ? zhCN : en
}

/** Fills `{n}`-style placeholders. Copy strings stay plain text so they can be translated whole. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}
