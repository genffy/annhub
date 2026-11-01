import type { CSSProperties } from 'react'
import {
  Check,
  Circle,
  ClipboardCopy,
  Crosshair,
  Download,
  EyeOff,
  Grid3x3,
  Highlighter,
  ListOrdered,
  MoveUpRight,
  Palette,
  PencilLine,
  Slash,
  Square,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import { Ic } from './parts'
import type { ProductUi } from './types'

// The screenshot session of docs/design (screenshot.md §1): the page dims, the selection stays bright with its pixel
// size, and the toolbar sits at the selection's corner. Everything is positioned in a 760 x 470 canvas.
export const SHOT_WIDTH = 760
export const SHOT_HEIGHT = 470

export function Bar({ left, top, width }: { left: number; top: number; width: number }) {
  return <i className="bar" style={{ left, top, width }} />
}

export function WideChart() {
  return (
    <svg viewBox="0 0 640 170" aria-hidden="true">
      <rect width="640" height="170" fill="#fff" />
      <path d="M24 36H620M24 76H620M24 116H620M24 150H620" stroke="#eceef3" strokeWidth="1" />
      <path d="M24 138 L130 134 L230 136 L310 130 L352 104 L392 56 L444 36 L520 42 L620 38" fill="none" stroke="#3b6fe0" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M352 22V152" stroke="#9aa1b2" strokeWidth="1.4" strokeDasharray="4 4" />
      <text x="358" y="30" fontSize="11" fill="#6b7280" fontFamily="sans-serif">
        retries begin
      </text>
      <text x="24" y="20" fontSize="11" fill="#6b7280" fontFamily="sans-serif">
        downstream p99 (ms)
      </text>
      <text x="24" y="164" fontSize="10" fill="#9aa1b2" fontFamily="sans-serif">
        0 min
      </text>
      <text x="560" y="164" fontSize="10" fill="#9aa1b2" fontFamily="sans-serif">
        10 min
      </text>
    </svg>
  )
}

/** The page being captured: skeleton text, a post, a figure. The page is not ours, so it stays in English. `marked` draws the highlighter over the post's first words and a line under the caption. */
function CapturedPage({ marked = false }: { marked?: boolean }) {
  return (
    <>
      <Bar left={60} top={20} width={300} />
      <Bar left={60} top={38} width={520} />
      <div className="ah-post" style={{ left: 60, top: 72, width: 640, height: 92 }}>
        <div className="av" />
        <div>
          <span className="nm">Display Name</span>
          <span className="hd">@handle · 3h</span>
        </div>
        <div className="tx">
          {marked ? (
            <>
              <mark className="ah-hl-mark" style={{ '--c': '#f6c453' } as CSSProperties}>
                Retries amplified the outage
              </mark>
              : downstream p99 went from 120ms to 2s within five minutes.
            </>
          ) : (
            'Retries amplified the outage: downstream p99 went from 120ms to 2s within five minutes.'
          )}
        </div>
      </div>
      <figure className="ah-fig" style={{ left: 60, top: 178, width: 640 }}>
        <WideChart />
        <figcaption>
          Figure 2 · downstream p99 latency{' '}
          {marked ? (
            <span className="ah-ann-under" style={{ '--c': '#e5484d' } as CSSProperties}>
              during the retry storm
            </span>
          ) : (
            'during the retry storm'
          )}
        </figcaption>
      </figure>
      <Bar left={60} top={410} width={560} />
      <Bar left={60} top={428} width={420} />
    </>
  )
}

/** The editor's floating toolbar (rect, ellipse, arrow, line, pen, highlighter · mosaic, text, step · colours · undo…), shared by the full scene and the smaller replicas. */
export function Toolbar({ style, compact, on = 'rect', color = 0 }: { style: CSSProperties; compact?: boolean; on?: 'rect' | 'highlighter' | 'step'; color?: number }) {
  const tool = (icon: typeof Square, active = false) => (
    <span className={`ah-tb-b${active ? ' on' : ''}`}>
      <Ic icon={icon} />
    </span>
  )
  const dots = ['#e5484d', '#ffd84d', '#22c4d6', '#fff', '#111']
  return (
    <div className="ah-shot-tb" style={style} aria-hidden="true">
      {tool(Square, on === 'rect')}
      {compact ? null : tool(Circle)}
      {tool(MoveUpRight)}
      {compact ? null : tool(Slash)}
      {tool(PencilLine)}
      {compact ? null : tool(Highlighter, on === 'highlighter')}
      <i className="ah-tb-sep" />
      {tool(Grid3x3)}
      {tool(Type)}
      {tool(ListOrdered, on === 'step')}
      <i className="ah-tb-sep" />
      <span className="ah-tb-dots">
        {dots.slice(0, compact ? 3 : 5).map((c, i) => (
          <i key={c} className={i === color ? 'on' : ''} style={{ background: c }} />
        ))}
      </span>
      <i className="ah-tb-sep" />
      {compact ? null : tool(Undo2)}
      {compact ? null : <i className="ah-tb-sep" />}
      {compact ? null : tool(Palette)}
      {tool(ClipboardCopy)}
      {tool(Download)}
      <i className="ah-tb-sep" />
      {tool(X)}
      <span className="ah-tb-ok">
        <Ic icon={Check} />
      </span>
    </div>
  )
}

/**
 * `select`: dragging out a region, with the hint bar. `edit`: the same region after the drag, edited in place: the
 * author's avatar and name are masked, the spike is circled, and the toolbar is open.
 */
export function ShotScene({ ui, mode, className = '' }: { ui: ProductUi; mode: 'select' | 'edit'; className?: string }) {
  return (
    <div className={`ah ah-shot ${className}`} style={{ width: SHOT_WIDTH, height: SHOT_HEIGHT }}>
      <CapturedPage />
      <div className="ah-shot-sel" style={{ left: 52, top: 62, width: 656, height: 332 }}>
        <span className="ah-shot-size">656 × 332</span>
      </div>
      {mode === 'select' ? (
        <>
          <div className="ah-shot-hint">{ui.shot.hint}</div>
          <div style={{ position: 'absolute', zIndex: 7, left: 690, top: 384, color: '#fff' }}>
            <Ic icon={Crosshair} size={20} />
          </div>
        </>
      ) : (
        <>
          <div className="ah-mosaic" style={{ left: 76, top: 86, width: 40, height: 40, borderRadius: '50%' }}>
            <span className="x">
              <Ic icon={X} />
            </span>
          </div>
          <div className="ah-mosaic" style={{ left: 128, top: 86, width: 172, height: 22 }}>
            <span className="x">
              <Ic icon={X} />
            </span>
          </div>
          <div className="ah-ann ah-ann-rect" style={{ left: 392, top: 196, width: 116, height: 104 }} />
          <div className="ah-ann ah-ann-text" style={{ left: 516, top: 210 }}>
            {ui.shot.annotation}
          </div>
          <Toolbar style={{ right: 48, top: 398 }} />
          <div className="ah-shot-hint" style={{ top: 'auto', bottom: 12 }}>
            <Ic icon={EyeOff} size={13} />
            {ui.shot.anonymousOn}
          </div>
        </>
      )}
    </div>
  )
}

/** A compact screenshot session for the three-ways card: the selection around a figure, one annotation, the toolbar. */
export const SHOT_MINI = { width: 400, height: 290 }

export function ShotMini({ ui }: { ui: ProductUi }) {
  return (
    <div className="ah ah-shot" style={{ width: SHOT_MINI.width, height: SHOT_MINI.height, borderRadius: 6, border: '1px solid var(--line)' }}>
      <Bar left={20} top={14} width={190} />
      <Bar left={20} top={28} width={280} />
      <figure className="ah-fig" style={{ left: 28, top: 62, width: 344 }}>
        <WideChart />
        <figcaption style={{ padding: '5px 12px 6px', fontSize: 11 }}>Figure 2 · downstream p99 latency</figcaption>
      </figure>
      <Bar left={20} top={232} width={250} />
      <Bar left={20} top={248} width={170} />
      <div className="ah-shot-sel" style={{ left: 18, top: 52, width: 364, height: 146 }}>
        <span className="ah-shot-size">364 × 146</span>
      </div>
      <div className="ah-ann ah-ann-rect" style={{ left: 232, top: 66, width: 58, height: 46 }} />
      <div className="ah-ann ah-ann-text" style={{ left: 214, top: 118, fontSize: 12 }}>
        {ui.shot.annotation}
      </div>
      <Toolbar compact style={{ right: 18, top: 206 }} />
    </div>
  )
}

/** A filled step badge: the centre lands on (x, y) (screenshot.md §1.1). */
export function StepBadge({ n, x, y, fill = '#e5484d', ink = '#fff' }: { n: number; x: number; y: number; fill?: string; ink?: string }) {
  return (
    <span className="ah-step-b" style={{ 'left': x, 'top': y, '--fill': fill, '--ink': ink } as CSSProperties}>
      {n}
    </span>
  )
}

/**
 * The step-number and highlighter tools (screenshot.md §1.1) in the editor: badges count up (the middle one selected),
 * the highlighter lays 40% ink over the post's first words, a line runs under the caption, and the widths row offers
 * thin, medium, thick.
 */
export const SHOT_STEPS = { width: SHOT_WIDTH, height: 486 }

export function ShotStepsScene({ ui }: { ui: ProductUi }) {
  return (
    <div className="ah ah-shot" style={{ width: SHOT_STEPS.width, height: SHOT_STEPS.height }}>
      <CapturedPage marked />
      <div className="ah-shot-sel" style={{ left: 52, top: 62, width: 656, height: 332 }}>
        <span className="ah-shot-size">656 × 332</span>
      </div>
      <StepBadge n={1} x={330} y={96} />
      <StepBadge n={2} x={412} y={226} />
      <StepBadge n={3} x={504} y={214} />
      {/* the ring and its × are the editor's selection affordance; they never enter the picture */}
      <span className="ah-step-ring" style={{ left: 412, top: 226 }} aria-hidden="true">
        <span className="x">
          <Ic icon={X} />
        </span>
      </span>
      <Toolbar on="highlighter" color={1} style={{ right: 48, top: 398 }} />
      <div className="ah-shot-widths" style={{ right: 48, top: 442 }} aria-hidden="true">
        <span className="lb">{ui.shot.width}</span>
        {[4, 7, 11].map((d, i) => (
          <span key={d} className={`wd${i === 1 ? ' on' : ''}`}>
            <i style={{ width: d, height: d }} />
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * A scrolling capture mid-stitch (screenshot.md §1.5): the long image grows screen by screen, the sticky header only
 * appears in the first screen, and the amber seam is where two screens were joined.
 */
export const SHOT_STITCH = { width: SHOT_WIDTH, height: 400 }

export function ShotStitchScene({ ui }: { ui: ProductUi }) {
  return (
    <div className="ah ah-shot" style={{ width: SHOT_STITCH.width, height: SHOT_STITCH.height }}>
      <div className="ah-stitch-card" style={{ left: 60, top: 20, width: 640, height: 300 }}>
        <div className="ah-stitch-nav" />
        <Bar left={20} top={48} width={300} />
        <Bar left={20} top={64} width={520} />
        <div className="ah-stitch-img" style={{ left: 20, top: 120, width: 280, height: 120 }} />
        <i className="ah-stitch-seam" style={{ top: 154 }} aria-hidden="true" />
        <Bar left={20} top={190} width={480} />
        <Bar left={20} top={206} width={560} />
        <Bar left={20} top={246} width={520} />
      </div>
      <div className="ah-shot-hint">
        {ui.shot.stitch.progress.replace('{done}', '3').replace('{total}', '12')} · {ui.shot.stitch.esc}
      </div>
    </div>
  )
}
