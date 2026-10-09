import type { CSSProperties } from 'react'
import { Check, ClipboardCopy, Crosshair, Download, EyeOff, Grid3x3, MoveUpRight, Palette, PencilLine, Circle, Square, Type, Undo2, X } from 'lucide-react'
import { Ic } from './parts'
import type { ProductUi } from './types'

// The screenshot session of docs/design/v2 (screenshot.md §1): the page dims, the selection stays bright with its pixel
// size, and the toolbar sits at the selection's corner. Everything is positioned in a 760 x 470 canvas.
export const SHOT_WIDTH = 760
export const SHOT_HEIGHT = 470

function Bar({ left, top, width }: { left: number; top: number; width: number }) {
  return <i className="bar" style={{ left, top, width }} />
}

function WideChart() {
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

/** The page being captured: skeleton text, a post, a figure. The page is not ours, so it stays in English. */
function CapturedPage() {
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
        <div className="tx">Retries amplified the outage: downstream p99 went from 120ms to 2s within five minutes.</div>
      </div>
      <figure className="ah-fig" style={{ left: 60, top: 178, width: 640 }}>
        <WideChart />
        <figcaption>Figure 2 · downstream p99 latency during the retry storm</figcaption>
      </figure>
      <Bar left={60} top={410} width={560} />
      <Bar left={60} top={428} width={420} />
    </>
  )
}

function Toolbar({ style, compact }: { style: CSSProperties; compact?: boolean }) {
  const tool = (icon: typeof Square, on = false) => (
    <span className={`ah-tb-b${on ? ' on' : ''}`}>
      <Ic icon={icon} />
    </span>
  )
  return (
    <div className="ah-shot-tb" style={style} aria-hidden="true">
      {tool(Square, true)}
      {compact ? null : tool(Circle)}
      {tool(MoveUpRight)}
      {compact ? null : tool(PencilLine)}
      <i className="ah-tb-sep" />
      {tool(Grid3x3)}
      {tool(Type)}
      <i className="ah-tb-sep" />
      <span className="ah-tb-dots">
        <i className="on" style={{ background: '#e5484d' }} />
        <i style={{ background: '#ffd84d' }} />
        <i style={{ background: '#22c4d6' }} />
        {compact ? null : <i style={{ background: '#fff' }} />}
        {compact ? null : <i style={{ background: '#111' }} />}
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
