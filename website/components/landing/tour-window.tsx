'use client'

import { useEffect, useRef, useState } from 'react'
import type { LandingCopy } from '@/lib/copy'
import TourControls from './tour-controls'

type LibraryTour = (typeof import('./library-tour'))['default']

/**
 * The interactive library window is a demonstration, not page content (docs/product/seo-geo.md §4.3): the static HTML keeps
 * only what carries words, and the window mounts from its own chunk only once its section is about to scroll into view,
 * so the product replicas stay out of the initial bundle and out of the first busy period. The placeholder holds the
 * stage's fixed height (.tour-window in landing.css), so nothing shifts when the real window takes over.
 */
export default function TourWindow({ copy }: { copy: LandingCopy }) {
  const [Tour, setTour] = useState<LibraryTour | null>(null)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = stage.current
    let on = true
    const load = () => {
      void import('./library-tour').then(module => {
        if (on) setTour(() => module.default)
      })
    }
    if (!el) {
      load()
      return
    }
    if (!('IntersectionObserver' in window)) {
      load()
      return () => {
        on = false
      }
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect()
          load()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(el)
    return () => {
      on = false
      observer.disconnect()
    }
  }, [])

  return Tour ? (
    <Tour copy={copy} />
  ) : (
    <div ref={stage} className="anchor-target">
      <TourControls copy={copy} />
      <div id="library-demo-window" className="tour-window mt-3 overflow-hidden rounded-lg border border-line bg-white" aria-busy="true">
        <div className="flex h-10 items-center gap-3.5 border-b border-line bg-surface-2 px-4">
          <span className="flex gap-1.5" aria-hidden="true">
            <i className="h-2.5 w-2.5 rounded-full bg-line-2" />
            <i className="h-2.5 w-2.5 rounded-full bg-line-2" />
            <i className="h-2.5 w-2.5 rounded-full bg-line-2" />
          </span>
          <span className="h-5 flex-1 rounded bg-surface" />
        </div>
        <p role="status" className="px-6 py-10 text-[14px] text-fg-3">
          {copy.tour.loading}
        </p>
      </div>
    </div>
  )
}
