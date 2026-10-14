'use client'

import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { StoryStep } from '@/lib/copy'
import { fill } from '@/lib/copy'
import { RichText } from './shared'

/**
 * Six moments of one week, one picture each. Keep inactive explanations in the HTML, but only mount the active
 * scene; the hidden browser windows otherwise add hundreds of DOM nodes and several ResizeObservers on first load.
 */
export default function StoryStepper({
  steps,
  scenes,
  focusedScenes,
  labels,
}: {
  steps: StoryStep[]
  scenes: Record<StoryStep['id'], ReactNode>
  focusedScenes: Record<string, ReactNode>
  labels: { title: string; stepOf: string; prev: string; next: string }
}) {
  const [active, setActive] = useState(0)
  const uid = useId()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const go = (i: number, focus = false) => {
    const next = (i + steps.length) % steps.length
    setActive(next)
    if (focus) tabs.current[next]?.focus()
  }

  const onKey = (e: KeyboardEvent) => {
    const focused = tabs.current.indexOf(e.target as HTMLButtonElement)
    const current = focused < 0 ? active : focused
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      go(current + 1, true)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      go(current - 1, true)
    } else if (e.key === 'Home') {
      e.preventDefault()
      go(0, true)
    } else if (e.key === 'End') {
      e.preventDefault()
      go(steps.length - 1, true)
    }
  }

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-10">
      <div role="group" aria-label={labels.title} onKeyDown={onKey} className="grid grid-cols-6 gap-2 lg:grid-cols-1 lg:gap-0">
        {steps.map((s, i) => (
          <button
            key={s.id}
            ref={el => {
              tabs.current[i] = el
            }}
            type="button"
            aria-pressed={i === active}
            aria-controls={`${uid}-panel-${s.id}`}
            onClick={() => go(i)}
            className={`min-h-11 rounded-md border px-2 py-2.5 text-left transition-colors lg:rounded-none lg:border-0 lg:border-l-2 lg:px-5 lg:py-3 ${i === active ? 'border-brand bg-brand text-brand-fg lg:bg-surface-2 lg:text-fg' : 'border-line-2 text-fg-3 hover:border-brand hover:text-brand-text'}`}
          >
            <span className="block text-center font-mono text-[13px] lg:hidden" aria-hidden="true">
              {i + 1}
            </span>
            <span className="hidden font-mono text-[12px] lg:block">{s.when}</span>
            <span className="sr-only lg:not-sr-only lg:mt-1 lg:block lg:text-[16px] lg:font-semibold lg:leading-6">{s.title}</span>
          </button>
        ))}
      </div>

      <div className="min-w-0">
        {steps.map((s, i) => (
          <div key={s.id} id={`${uid}-panel-${s.id}`} role="region" aria-label={s.title} hidden={i !== active}>
            <p className="mb-1 font-mono text-[12px] text-fg-3 lg:hidden">{s.when}</p>
            <h3 className="mb-4 text-[20px] font-semibold leading-7 text-fg lg:hidden">{s.title}</h3>
            <div className="rounded-lg border border-line bg-canvas p-3 sm:p-5" role="img" aria-label={s.caption}>
              {i === active ? (
                <div aria-hidden="true" inert>
                  <div className="mx-auto max-w-[560px] xl:hidden">{focusedScenes[s.id]}</div>
                  <div className="hidden xl:block">{scenes[s.id]}</div>
                </div>
              ) : null}
            </div>
            {/* All six explanations remain in the static HTML; the selected scene is the only one mounted. */}
            <p className="mt-4 text-[15px] leading-7 text-fg-2">
              <RichText text={s.body} />
            </p>
          </div>
        ))}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => go(active - 1)}
            className="inline-flex h-11 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3.5 text-[13.5px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {labels.prev}
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            className="inline-flex h-11 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3.5 text-[13.5px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text"
          >
            {labels.next}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
          <span className="ml-auto font-mono text-[12.5px] tabular-nums text-fg-3" aria-live="polite">
            {fill(labels.stepOf, { n: active + 1, total: steps.length })}
          </span>
        </div>
      </div>
    </div>
  )
}
