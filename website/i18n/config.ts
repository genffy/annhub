export const i18n = {
  defaultLocale: 'zh-CN',
  locales: ['en', 'zh-CN'],
} as const

export type Locale = (typeof i18n)['locales'][number]
