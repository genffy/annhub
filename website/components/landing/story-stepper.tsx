'use client'

import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { StoryStep } from '@/lib/copy'
import { fill } from '@/lib/copy'
import { RichText } from './shared'

/**
 * Six moments of one week, one picture each. Every picture is rendered on the server and only shown or hidden here,
 * so the whole walkthrough is in the page for readers and crawlers and switching costs nothing.
 */
export default function StoryStepper({
  steps,
  scenes,
  labels,
}: {
  steps: StoryStep[]
  scenes: Record<StoryStep['id'], ReactNode>
  labels: { stepOf: string; prev: string; next: string }
}) {
  const [active, setActive] = useState(0)
  const uid = useId()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const step = steps[active]!

  const go = (i: number, focus = false) => {
    const next = (i + steps.length) % steps.length
    setActive(next)
    if (focus) tabs.current[next]?.focus()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      go(active + 1, true)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      go(active - 1, true)
    } else if (e.key === 'Home') {
      e.preventDefault()
      go(0, true)
    } else if (e.key === 'End') {
      e.preventDefault()
      go(steps.length - 1, true)
    }
  }

  return (
    <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
      <div>
        {/* below lg: numbers to jump between steps; the active step's text follows */}
        <div className="flex gap-2 lg:hidden" role="presentation">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => go(i)}
              className={`h-9 min-w-9 flex-1 rounded-md border text-[13px] font-semibold tabular-nums transition-colors ${i === active ? 'border-brand bg-brand text-brand-fg' : 'border-line-2 bg-white text-fg-3'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div role="tablist" aria-orientation="vertical" aria-label={steps[0]!.title} onKeyDown={onKey} className="mt-6 lg:mt-0">
          {steps.map((s, i) => {
            const on = i === active
            return (
              <button
                key={s.id}
                ref={el => {
                  tabs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${s.id}`}
                aria-selected={on}
                aria-controls={`${uid}-panel-${s.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => go(i)}
                className={`group relative w-full border-l-2 py-4 pl-6 text-left transition-colors ${on ? 'block border-brand' : 'hidden border-line-2 hover:border-fg-4 lg:block'}`}
              >
                <span
                  className={`absolute -left-[7px] top-[22px] h-3 w-3 rounded-full border-2 bg-white ${on ? 'border-brand' : 'border-line-2 group-hover:border-fg-4'}`}
                  aria-hidden="true"
                />
                <span className="font-mono text-[12px] text-fg-4">{s.when}</span>
                <span className={`mt-1 block text-[18px] font-semibold leading-snug sm:text-[19px] ${on ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2'}`}>{s.title}</span>
                {on ? (
                  <span className="mt-2 block max-w-[460px] text-[15px] leading-7 text-fg-3">
                    <RichText text={s.body} />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="mt-6 flex items-center gap-3 lg:mt-8">
          <button
            type="button"
            onClick={() => go(active - 1)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3.5 text-[13.5px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {labels.prev}
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3.5 text-[13.5px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text"
          >
            {labels.next}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
          <span className="ml-1 font-mono text-[12.5px] tabular-nums text-fg-4" aria-live="polite">
            {fill(labels.stepOf, { n: active + 1, total: steps.length })}
          </span>
        </div>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border border-line bg-canvas p-3 sm:p-6">
          {steps.map((s, i) => (
            <div key={s.id} role="tabpanel" id={`${uid}-panel-${s.id}`} aria-labelledby={`${uid}-tab-${s.id}`} hidden={i !== active}>
              <div role="img" aria-label={s.caption}>
                {scenes[s.id]}
              </div>
            </div>
          ))}
          <p className="mt-4 text-[12.5px] leading-5 text-fg-3">{step.caption}</p>
        </div>
      </div>
    </div>
  )
}
