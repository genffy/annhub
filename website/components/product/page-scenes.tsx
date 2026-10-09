import type { CSSProperties, ReactNode } from 'react'
import { ArrowUpRight, Bookmark, ChevronUp, Ellipsis, Link as LinkIcon, MessageSquareText, RotateCcw, Scan } from 'lucide-react'
import { Ic } from './parts'
import type { RetriesPage } from './sample'
import type { ProductUi } from './types'

/** A custom property in a style object. */
const cssVar = (name: string, value: string): CSSProperties => ({ [name]: value }) as CSSProperties

// ── overlays the extension draws on a page ───────────────────────────────────────────────────────

/** Selection menu: exactly two items, Clip then Screenshot, icon + word (docs/v2/extension.md §2.1). */
export function SelectionMenu({
  ui,
  hover,
  tip,
  onPick,
  className = '',
}: {
  ui: ProductUi
  hover?: 0 | 1
  tip?: 'clip' | 'screenshot'
  onPick?: (kind: 'clip' | 'screenshot') => void
  className?: string
}) {
  const items = [
    { kind: 'clip' as const, icon: Bookmark, label: ui.menu.clip, hint: ui.menu.clipHint },
    { kind: 'screenshot' as const, icon: Scan, label: ui.menu.screenshot, hint: ui.menu.screenshotHint },
  ]
  const tipped = items.find(i => i.kind === tip)
  return (
    <span className={`ah ah-hm static ${className}`} role={onPick ? 'toolbar' : undefined} aria-label={onPick ? 'AnnHub' : undefined}>
      {items.map((it, i) => {
        const cls = `ah-hm-b ah-t-${it.kind}${hover === i ? ' is-hover' : ''}`
        const inner = (
          <>
            <Ic icon={it.icon} />
            <span>{it.label}</span>
          </>
        )
        return onPick ? (
          <button key={it.kind} type="button" className={cls} onMouseDown={e => e.preventDefault()} onClick={() => onPick(it.kind)}>
            {inner}
          </button>
        ) : (
          <span key={it.kind} className={cls}>
            {inner}
          </span>
        )
      })}
      {tipped ? (
        <span className="ah-hm-tip ah-tip" style={{ left: 0, bottom: 'calc(100% + 10px)' }}>
          <b>{tipped.label}</b>
          <small>{tipped.hint}</small>
        </span>
      ) : null}
    </span>
  )
}

/** "Clipped · Undo · Edit", about 3 seconds, the bar at the bottom is the time left. */
export function ClipToast({ ui, progress = 62, state = 'clipped', className = '' }: { ui: ProductUi; progress?: number; state?: 'clipped' | 'undone'; className?: string }) {
  if (state === 'undone') {
    return (
      <div className={`ah ah-toast ${className}`}>
        <Ic icon={Bookmark} />
        <span>{ui.toast.undone}</span>
      </div>
    )
  }
  return (
    <div className={`ah ah-toast ${className}`} role="status">
      <Ic icon={Bookmark} />
      <span>{ui.toast.clipped}</span>
      <i className="ah-sepd" />
      <span className="ah-act">{ui.toast.undo}</span>
      <span className="ah-act">{ui.toast.edit}</span>
      <div className="ah-tbar">
        <i style={cssVar('--p', `${progress}%`)} />
      </div>
    </div>
  )
}

/** The small bubble from the toast's "Edit": title, tags, note. Nothing else is asked at save time. */
export function QuickEdit({ ui, data, className = '' }: { ui: ProductUi; data: { title: string; tags: string[]; note: string }; className?: string }) {
  return (
    <span className={`ah ah-pop static ${className}`} style={{ width: 322 }}>
      <span className="ah-qe">
        <span className="ah-qe-hd">
          <Ic icon={Bookmark} />
          {ui.toast.clipped}
          <span className="ah-grow" />
          <span className="ah-muted" style={{ fontSize: 11, fontWeight: 400 }}>
            {ui.edit.autosave}
          </span>
        </span>
        <span className="ah-field">
          <span className="ah-label">{ui.edit.title}</span>
          <span className="ah-input" style={{ minHeight: 30, fontSize: 12.5 }}>
            {data.title}
          </span>
        </span>
        <span className="ah-field">
          <span className="ah-label">{ui.edit.tags}</span>
          <span className="ah-tagin is-focus">
            {data.tags.map(t => (
              <span key={t} className="ah-vtag">
                {t}
              </span>
            ))}
            <span className="ah-ph" style={{ fontSize: 12.5 }}>
              {ui.edit.addTag}
            </span>
            <i className="ah-caret" />
          </span>
        </span>
        <span className="ah-field">
          <span className="ah-label">{ui.edit.note}</span>
          <span className="ah-textarea" style={{ fontSize: 12.5, minHeight: 50 }}>
            {data.note}
          </span>
        </span>
        <span className="flex items-center justify-between">
          <span className="ah-link inline-flex items-center gap-1" style={{ fontSize: 12 }}>
            {ui.edit.more}
            <Ic icon={ArrowUpRight} size={13} />
          </span>
          <span className="ah-btn ah-btn-primary ah-btn-sm">{ui.edit.done}</span>
        </span>
      </span>
    </span>
  )
}

/** The capsule that appears next to a block the pointer rests on: Clip | Screenshot | parent | more. */
export function BlockPill({ ui, saved, up, corner = 'tr', className = '' }: { ui: ProductUi; saved?: boolean; up?: boolean; corner?: 'tr' | 'tl'; className?: string }) {
  return (
    <div className={`ah ah-pill${corner === 'tl' ? ' at-tl' : ''} ${className}`} role="group">
      <span className="ah-pill-seg">
        <Ic icon={Bookmark} />
        <span>{saved ? ui.block.clipped : ui.block.clip}</span>
      </span>
      <span className="ah-pill-seg is-alt">
        <Ic icon={Scan} />
        <span>{ui.block.shot}</span>
      </span>
      {up ? (
        <i className="ah-pill-sub">
          <Ic icon={ChevronUp} />
        </i>
      ) : null}
      <i className="ah-pill-sub">
        <Ic icon={Ellipsis} />
      </i>
    </div>
  )
}

/** Outline the extension draws around the block under the pointer. It is a floating layer, never a mark on the page. */
export function BlockOutline({ label, faint }: { label?: string; faint?: boolean }) {
  return (
    <i className={`ah-blk${faint ? ' is-faint' : ''}`} aria-hidden="true">
      {label ? <em>{label}</em> : null}
    </i>
  )
}

/** Anchors an overlay to the selected text itself, so it follows the text if fonts reflow the page. */
export function Anchored({ place, children }: { place: 'above' | 'below'; children: ReactNode }) {
  return <span className={`ah-over ah-over-${place}`}>{children}</span>
}

// ── web pages (the user's, always light and serif) ───────────────────────────────────────────────

/** The article the hero selects from. It is an English page on purpose: the page is not ours, only the menu is. */
export function HeroArticle({ ui, menu = true, toast = false }: { ui: ProductUi; menu?: boolean; toast?: boolean }) {
  return (
    <div className="ah-pg" style={{ minHeight: '100%' }}>
      <div className="ah-pg-nav">
        <b>engineering.example.com</b>
        <span>Articles</span>
        <span>Topics</span>
        <span>About</span>
      </div>
      <div className="ah-pg-art">
        <div className="ah-h1">Backpressure in Streams</div>
        <div className="ah-pg-by">Platform Engineering · Updated Sep 28 · 9 min read</div>
        <p>
          When a producer emits events faster than a consumer can process them, something has to give. Queues grow, memory climbs, and eventually the slowest component takes the
          whole pipeline down with it.
        </p>
        <p>
          <span className="ah-sel ah-anchor">
            <b>Backpressure</b> is how a system pushes that pain back where it belongs.
            {menu ? (
              <Anchored place="above">
                <SelectionMenu ui={ui} hover={0} tip="clip" />
              </Anchored>
            ) : null}
          </span>{' '}
          Instead of letting buffers absorb the mismatch indefinitely, the consumer signals demand upstream so the producer slows down, pauses, or drops work it cannot deliver.
        </p>
        <div className="ah-h2">Three common strategies</div>
        <ol>
          <li>Demand signaling: the consumer grants credits and the producer sends no more than it was granted.</li>
          <li>Bounded buffers: queues with a hard limit that block or reject at the edge.</li>
          <li>Load shedding: drop the least valuable work first, on purpose.</li>
        </ol>
      </div>
      {toast ? (
        <div className="ah-toast-pos">
          <ClipToast ui={ui} />
        </div>
      ) : null}
    </div>
  )
}

/** The retries article of the walkthrough, in the language of the page. */
export function RetriesArticle({
  ui,
  page,
  focus,
  offset = 0,
  toast,
  quickEdit,
}: {
  ui: ProductUi
  page: RetriesPage
  /** `select`: a selection with the menu on the first section; `block`: the pointer rests on the second section. */
  focus: 'select' | 'block' | 'none'
  /** How far the page is scrolled, in pixels. */
  offset?: number
  toast?: 'clipped' | 'undone'
  quickEdit?: { title: string; tags: string[]; note: string }
}) {
  const [before, after] = page.storm.body.split(page.storm.selection)
  return (
    <div className="ah-pg" style={{ minHeight: '100%', marginTop: -offset }}>
      <div className="ah-pg-nav">
        <b>engineering.example.com</b>
        {page.siteNav.map(item => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="ah-pg-art" style={{ paddingTop: 30 }}>
        <div className="ah-h1" style={{ fontSize: 34 }}>
          {page.title}
        </div>
        <div className="ah-pg-by">{page.byline}</div>
        <p>{page.intro}</p>
        <section className="ah-sx">
          <div className="ah-h2">{page.storm.heading}</div>
          <p>
            {before}
            {focus === 'select' ? (
              <span className="ah-sel ah-anchor">
                {page.storm.selection}
                <Anchored place="above">
                  <SelectionMenu ui={ui} hover={0} />
                </Anchored>
                {quickEdit ? (
                  <Anchored place="below">
                    <QuickEdit ui={ui} data={quickEdit} />
                  </Anchored>
                ) : null}
              </span>
            ) : (
              page.storm.selection
            )}
            {after}
          </p>
        </section>
        <section className="ah-sx">
          {focus === 'block' ? (
            <>
              <BlockOutline />
              <BlockPill ui={ui} up />
            </>
          ) : null}
          <div className="ah-h2">{page.backoff.heading}</div>
          <p>
            {page.backoff.before}
            <b>{page.backoff.bold}</b>
            {page.backoff.after}
          </p>
          <ol>
            {page.backoff.steps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>{page.backoff.foot}</p>
        </section>
        <section className="ah-sx">
          <div className="ah-h2">{page.budget.heading}</div>
          <p>{page.budget.body}</p>
        </section>
      </div>
      {toast ? (
        <div className="ah-toast-pos">
          <ClipToast ui={ui} state={toast} />
        </div>
      ) : null}
    </div>
  )
}

/** A feed post. The page's own "more" button sits in its top-right corner, so the capsule moves to the left. */
export function FeedPost({ ui, hovered, text, link }: { ui: ProductUi; hovered?: boolean; text: string; link: string }) {
  return (
    <div className="ah-sx">
      <article className="ah-tw">
        <span className="ah-tw-more" aria-hidden="true">
          <Ic icon={Ellipsis} />
        </span>
        <i className="av" aria-hidden="true" />
        <div className="ah-tw-b">
          <div className="ah-tw-h">
            <b>Display Name</b>
            <span>@handle · 3h</span>
          </div>
          <div className="ah-tw-t">{text}</div>
          <div className="ah-tw-l">
            <Ic icon={LinkIcon} size={13} />
            {link}
          </div>
          <div className="flex gap-9 text-[13px] text-[#77736d]" style={{ marginTop: 10 }}>
            <span className="inline-flex items-center gap-1.5">
              <Ic icon={MessageSquareText} size={13} />
              31
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Ic icon={RotateCcw} size={13} />
              212
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Ic icon={ArrowUpRight} size={13} />
            </span>
          </div>
        </div>
        {hovered ? (
          <>
            <BlockOutline />
            <BlockPill ui={ui} corner="tl" />
          </>
        ) : null}
      </article>
    </div>
  )
}
