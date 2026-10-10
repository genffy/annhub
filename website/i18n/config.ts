export const i18n = {
  // A browser language that matches neither locale gets English (docs/v2/seo-geo.md §3.1).
  defaultLocale: 'en',
  locales: ['en', 'zh-CN'],
} as const

export type Locale = (typeof i18n)['locales'][number]
