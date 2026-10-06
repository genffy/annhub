import { uiCount, uiText, type UiLanguage } from './ui-text'

/** Relative time (extension.md §5.3): just now / N min / N h / N days, then the date after 7 days. */
export function relativeTime(epochMs: number, now = Date.now(), lang?: UiLanguage): string {
  const delta = now - epochMs
  if (delta < 60_000) return uiText('time.justNow', {}, lang)
  if (delta < 3_600_000) return uiText('time.minutesAgo', { count: Math.floor(delta / 60_000) }, lang)
  if (delta < 86_400_000) return uiText('time.hoursAgo', { count: Math.floor(delta / 3_600_000) }, lang)
  if (delta < 7 * 86_400_000) return uiCount('time.daysAgo', Math.floor(delta / 86_400_000), {}, lang)
  return new Date(epochMs).toLocaleDateString()
}
