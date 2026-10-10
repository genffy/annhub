'use client'

import { OPEN_CONSENT_EVENT } from '@/lib/consent'
import { ANALYTICS_TOKEN } from '@/lib/site'

/** The footer button that reopens the consent card, for anyone. No analytics, no button. */
export default function AnalyticsSettings({ label, className }: { label: string; className: string }) {
  if (!ANALYTICS_TOKEN) return null
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))} className={className}>
      {label}
    </button>
  )
}
