'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import type { LandingCopy } from '@/lib/copy'
import { analyticsState, asksFromCookies, CONSENT_KEY, OPEN_CONSENT_EVENT, readChoice, storedChoice } from '@/lib/consent'
import type { AnalyticsState, ConsentChoice } from '@/lib/consent'
import { ANALYTICS_TOKEN } from '@/lib/site'

const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

/** Sent when the visitor chooses on this page; other tabs hear the `storage` event instead. */
const CHOICE_EVENT = 'annhub:analytics-choice'

/** The choice made on this page. It holds even when the browser refuses to store it. */
let pageChoice: ConsentChoice | null = null

/** Today in UTC, YYYY-MM-DD: the only date the stored choice carries. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(CONSENT_KEY)
  } catch {
    return null // storage blocked: the visitor is simply asked again next time
  }
}

function store(choice: ConsentChoice) {
  pageChoice = choice
  try {
    window.localStorage.setItem(CONSENT_KEY, storedChoice(choice, today()))
  } catch {
    // storage blocked: the choice holds for this page only
  }
  window.dispatchEvent(new Event(CHOICE_EVENT))
}

/** What analytics does on this page: from the visitor's choice, the proxy's region cookie and Global Privacy Control. */
function readState(): AnalyticsState {
  return analyticsState({
    choice: pageChoice ?? readChoice(readStored(), today()),
    asks: asksFromCookies(document.cookie),
    gpc: (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true,
  })
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHOICE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHOICE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function loadBeacon() {
  if (document.querySelector(`script[src="${BEACON_SRC}"]`)) return
  const script = document.createElement('script')
  script.defer = true
  script.src = BEACON_SRC
  script.dataset.cfBeacon = JSON.stringify({ token: ANALYTICS_TOKEN })
  document.head.append(script)
}

type Props = { copy: LandingCopy['consent']; policyHref: string }

/**
 * Loads Cloudflare Web Analytics only when the visitor's choice allows it, and asks first where the law wants consent
 * (docs/v2/website.md §19, permissions.md §8). Without a token there is nothing to load and nothing to ask.
 */
export default function AnalyticsConsent(props: Props) {
  return ANALYTICS_TOKEN ? <ConsentCard {...props} /> : null
}

/**
 * Nothing renders on the server: the state needs the cookie the proxy sets from the visitor's country, and the
 * browser's storage. The card is fixed to the bottom of the viewport, so it never moves the page; it comes first in the
 * DOM, so keyboard and screen-reader users reach it before the page. It stays until the visitor chooses.
 */
function ConsentCard({ copy, policyHref }: Props) {
  const state = useSyncExternalStore(subscribe, readState, () => null)
  // Opened from the footer's "Analytics settings", whatever the state.
  const [settings, setSettings] = useState(false)
  const firstButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  // "Allow" counts the page it is given on; "Don't allow" holds from the next page, a script that has run cannot be undone.
  useEffect(() => {
    if (state === 'load') loadBeacon()
  }, [state])

  useEffect(() => {
    const open = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setSettings(true)
    }
    window.addEventListener(OPEN_CONSENT_EVENT, open)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open)
  }, [])

  // Opened on purpose from the footer: focus moves to the card. Shown on arrival it never takes focus.
  useEffect(() => {
    if (settings) firstButton.current?.focus()
  }, [settings])

  const closeSettings = () => {
    setSettings(false)
    returnFocus.current?.focus()
  }

  const choose = (choice: ConsentChoice) => {
    store(choice)
    if (settings) closeSettings()
  }

  if (!settings && state !== 'ask') return null
  const onKeyDown = (e: KeyboardEvent) => {
    if (settings && e.key === 'Escape') closeSettings()
  }
  // What the visitor has now, explicit or by default; shown when the card is opened from the footer.
  const current = state === 'load' ? copy.current.granted : state === 'off' ? copy.current.denied : null
  // Both answers look the same and are as easy to reach: refusing is never the smaller button.
  const button = 'h-10 rounded-md border border-line-2 bg-white px-3 text-[14px] font-semibold text-fg transition-colors hover:border-brand hover:text-brand-text'

  return (
    <section
      aria-label={settings ? copy.settingsLabel : copy.label}
      onKeyDown={onKeyDown}
      className="fixed inset-x-3 bottom-3 z-[55] mx-auto max-w-[440px] rounded-lg border border-line bg-white p-4 shadow-pop sm:inset-x-auto sm:bottom-5 sm:left-5 sm:p-5"
    >
      <p className="text-[14px] leading-6 text-fg-2">
        {copy.body}{' '}
        <a href={policyHref} className="font-medium text-brand-text underline decoration-line-2 underline-offset-[3px] transition-colors hover:decoration-brand">
          {copy.policy}
        </a>
      </p>
      {settings && current ? <p className="mt-2 text-[13px] leading-5 text-fg-3">{current}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button ref={firstButton} type="button" onClick={() => choose('granted')} className={button}>
          {copy.allow}
        </button>
        <button type="button" onClick={() => choose('denied')} className={button}>
          {copy.deny}
        </button>
      </div>
    </section>
  )
}
