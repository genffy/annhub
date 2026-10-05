export type UiLanguage = 'zh' | 'en'

export type Catalog = Record<string, Record<UiLanguage, string>>

/** Identity with a check: every entry must carry both languages. */
export function defineMessages<const T extends Catalog>(messages: T): T {
  return messages
}
