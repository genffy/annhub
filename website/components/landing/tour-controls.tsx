import { FileText, Highlighter, Library, Link as LinkIcon, Tags } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'

const ICONS = [Library, LinkIcon, Highlighter, Tags, FileText]

/** Shared by the static loading state and the live tour, so guidance is readable before the chunk loads. */
export default function TourControls({ copy, active = 0, onSelect }: { copy: LandingCopy; active?: number; onSelect?: (index: number) => void }) {
  return (
    <div className="tour-controls">
      <div role="group" aria-label={copy.tour.tasksLabel} className="flex gap-1.5 overflow-x-auto py-1 sm:gap-2 lg:grid lg:grid-cols-5">
        {copy.tour.pins.map((pin, i) => {
          const Icon = ICONS[i]!
          return (
            <button
              key={pin.title}
              type="button"
              data-tour-pin={i}
              aria-pressed={i === active}
              aria-controls="library-demo-window"
              disabled={!onSelect}
              onClick={() => onSelect?.(i)}
              className="inline-flex min-h-11 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text disabled:cursor-wait disabled:opacity-60 aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-brand-fg sm:px-4"
            >
              <Icon size={15} aria-hidden="true" className="hidden sm:block" />
              {pin.title}
            </button>
          )
        })}
      </div>
      <div className="mt-3 min-h-[72px] text-[14px] leading-6 text-fg-2 sm:min-h-12" aria-live="polite">
        {copy.tour.pins.map((pin, i) => (
          <p key={pin.title} hidden={i !== active}>
            {pin.body}
          </p>
        ))}
      </div>
    </div>
  )
}
