import { ArrowRight, CircleCheck, CircleDashed } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { Container, SectionTitle } from './shared'
import { PROGRESS_URL, REPO_URL } from './links'

/**
 * Where the project honestly stands (docs/v2/roadmap.md): three releases scope-complete, validation not started, no
 * public download. This is the page's one primary action, so it is the only filled button in the lower half.
 */
export default function Progress({ copy }: { copy: LandingCopy }) {
  const { progress } = copy
  return (
    <section id="progress" aria-labelledby="progress-title" className="anchor-target bg-white py-20 sm:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <div>
            <SectionTitle id="progress-title">{progress.title}</SectionTitle>
            <p className="mt-5 max-w-[480px] text-[16.5px] leading-8 text-fg-2">{progress.lead}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={PROGRESS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand px-5 text-[15px] font-semibold text-brand-fg shadow-[0_8px_20px_-8px_rgba(103,58,184,0.7)] transition-colors hover:bg-[color-mix(in_oklab,var(--brand)_86%,#000)]"
              >
                {progress.cta}
                <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center rounded-lg border border-line-2 px-5 text-[15px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text"
              >
                {progress.secondary}
              </a>
            </div>
            <p className="mt-6 max-w-[460px] border-l-2 border-line-2 pl-3.5 text-[13.5px] leading-6 text-fg-3">{progress.download}</p>
          </div>

          <div>
            <ol className="border-y border-line">
              {progress.stages.map(stage => (
                <li key={stage.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 border-b border-line py-6 last:border-b-0 sm:grid-cols-[56px_minmax(0,1fr)_auto]">
                  <span className="pt-0.5 font-mono text-[15px] font-semibold text-fg-2">{stage.id}</span>
                  <div>
                    <h3 className="text-[18px] font-semibold leading-snug text-fg">{stage.name}</h3>
                    <p className="mt-1.5 max-w-[520px] text-[14.5px] leading-6 text-fg-3">{stage.body}</p>
                  </div>
                  <span
                    className={`col-start-2 mt-3 inline-flex h-7 w-fit items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12.5px] font-semibold sm:col-start-3 sm:mt-0.5 ${
                      stage.done
                        ? 'border-[color-mix(in_oklab,var(--ok)_30%,white)] bg-[color-mix(in_oklab,var(--ok)_10%,white)] text-[color-mix(in_oklab,var(--ok)_72%,var(--fg))]'
                        : 'border-line-2 bg-surface-2 text-fg-3'
                    }`}
                  >
                    {stage.done ? <CircleCheck size={14} aria-hidden="true" /> : <CircleDashed size={14} aria-hidden="true" />}
                    {stage.done ? progress.status.done : progress.status.todo}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[12.5px] leading-5 text-fg-3">{progress.legend}</p>
          </div>
        </div>
      </Container>
    </section>
  )
}
