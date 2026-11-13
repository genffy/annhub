import type { CSSProperties } from 'react'
import { Camera, Circle, Eraser, Highlighter, ListOrdered, MousePointer2, MoveUpRight, PencilLine, Slash, Square, Type, Undo2, X } from 'lucide-react'
import { Ic } from './parts'
import { Bar, Toolbar, WideChart } from './shot-scene'
import type { ProductUi } from './types'

/*
 * The page-annotation layer of docs/design (annotate.md §1, §3): a toolbar standing on the window edge, ink drawn
 * over the article, the ink carried into the screenshot editor, and the recording state where the ink and the
 * cursor highlight are in the picture. Everything is positioned in fixed-size canvases and scaled by `Fit`.
 */

/** The annotated article, drawn at 760 x 640 so the full vertical toolbar fits beside it. */
export const ANNOTATE = { width: 760, height: 640 }

/** The five annotation colours of the annotate board: red, yellow, teal, white, black. */
const DOTS = ['#e5484d', '#ffd84d', '#0f9d8f', '#fff', '#111']

function AnnotateToolbar({ ui }: { ui: ProductUi }) {
  const tool = (icon: typeof Square, title: string, on = false) => (
    <span className={`ah-tb-b${on ? ' on' : ''}`} title={title}>
      <Ic icon={icon} />
    </span>
  )
  return (
    <div className="ah-annot-tb" aria-hidden="true">
      {tool(PencilLine, ui.shot.pen)}
      {tool(Highlighter, ui.shot.highlighter)}
      {tool(Slash, ui.shot.line)}
      {tool(MoveUpRight, ui.shot.arrow, true)}
      {tool(Square, ui.shot.rect)}
      {tool(Circle, ui.shot.ellipse)}
      {tool(Type, ui.shot.text)}
      {tool(ListOrdered, ui.shot.step)}
      <i className="ah-tb-sep" />
      <span className="ah-tb-dots">
        {DOTS.map((c, i) => (
          <i key={c} className={i === 0 ? 'on' : ''} style={{ background: c }} />
        ))}
      </span>
      <i className="ah-tb-sep" />
      {[4, 7, 11].map((d, i) => (
        <span key={d} className={`ah-annot-wd${i === 1 ? ' on' : ''}`}>
          <i style={{ width: d, height: d }} />
        </span>
      ))}
      <i className="ah-tb-sep" />
      {tool(Undo2, ui.shot.undo)}
      {tool(Eraser, ui.annotate.clear)}
      {tool(Camera, ui.annotate.screenshot)}
      <i className="ah-tb-sep" />
      {tool(X, ui.annotate.exit)}
    </div>
  )
}

/** The ink of the main scene: a red arrow pointing at the chart, a teal circle around the spike. */
function MainInk() {
  return (
    <svg className="ah-annot-ink" viewBox="0 0 760 640" aria-hidden="true">
      <defs>
        <marker id="ah-annot-head-main" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0 0L7 3.5L0 7z" fill="#e5484d" />
        </marker>
      </defs>
      <path d="M110 520 L 360 380" stroke="#e5484d" strokeWidth="3" fill="none" strokeLinecap="round" markerEnd="url(#ah-annot-head-main)" />
      <ellipse cx="440" cy="300" rx="92" ry="42" fill="none" stroke="#0f9d8f" strokeWidth="3" />
    </svg>
  )
}

export function AnnotateScene({ ui }: { ui: ProductUi }) {
  return (
    <div className="ah ah-shot" style={{ width: ANNOTATE.width, height: ANNOTATE.height, borderRadius: 6, border: '1px solid var(--line)' }}>
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
      <Bar left={60} top={190} width={640} />
      <Bar left={60} top={208} width={420} />
      <figure className="ah-fig" style={{ left: 60, top: 236, width: 640 }}>
        <WideChart />
        <figcaption>Figure 2 · downstream p99 latency during the retry storm</figcaption>
      </figure>
      <Bar left={60} top={466} width={560} />
      <Bar left={60} top={484} width={420} />
      <Bar left={60} top={522} width={640} />
      <Bar left={60} top={540} width={520} />
      <MainInk />
      <span className="ah-step-b" style={{ 'left': 440, 'top': 342, '--fill': '#e5484d', '--ink': '#fff' } as CSSProperties}>
        1
      </span>
      {/* the pointer mid-draw, at the arrow's tip */}
      <span className="ah-annot-cursor" style={{ left: 356, top: 376 }} aria-hidden="true">
        <Ic icon={MoveUpRight} />
      </span>
      <AnnotateToolbar ui={ui} />
    </div>
  )
}

/** The ink carried into the screenshot editor (annotate.md §1.3): the same strokes, inside the selection. */
export const ANNOTATE_EDITOR = { width: 460, height: 232 }

export function AnnotateEditorScene() {
  return (
    <div className="ah ah-shot" style={{ width: ANNOTATE_EDITOR.width, height: ANNOTATE_EDITOR.height, borderRadius: 6, border: '1px solid var(--line)' }}>
      <Bar left={24} top={36} width={180} />
      <Bar left={24} top={54} width={300} />
      <div className="ah-post" style={{ left: 24, top: 76, width: 380, height: 88 }}>
        <div className="av" />
        <div>
          <span className="nm">Display Name</span>
          <span className="hd">@handle · 3h</span>
        </div>
        <div className="tx">Retries amplified the outage…</div>
      </div>
      <figure className="ah-fig" style={{ left: 24, top: 178, width: 380 }}>
        <WideChart />
      </figure>
      <div className="ah-shot-sel" style={{ left: 20, top: 28, width: 340, height: 176 }}>
        <span className="ah-shot-size">340 × 176</span>
      </div>
      <svg className="ah-annot-ink" viewBox="0 0 460 232" aria-hidden="true">
        <defs>
          <marker id="ah-annot-head-edit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L6 3L0 6z" fill="#e5484d" />
          </marker>
        </defs>
        <path d="M60 168 L 132 128" stroke="#e5484d" strokeWidth="2.5" fill="none" strokeLinecap="round" markerEnd="url(#ah-annot-head-edit)" />
        <ellipse cx="238" cy="110" rx="62" ry="30" fill="none" stroke="#0f9d8f" strokeWidth="2.5" />
      </svg>
      {/* the badge keeps its 28 CSS px here too: it does not shrink with the picture (screenshot.md §1.1) */}
      <span className="ah-step-b" style={{ 'left': 238, 'top': 140, '--fill': '#e5484d', '--ink': '#fff' } as CSSProperties}>
        1
      </span>
      <Toolbar compact style={{ right: 16, top: 192 }} />
    </div>
  )
}

/**
 * The recording state (annotate.md §2, §3): the toolbar popup carries the timer and the stop button, while the page
 * shows the ink and the cursor highlight the video films.
 */
export const ANNOTATE_RECORD = { width: 460, height: 232 }

export function AnnotateRecordScene({ ui }: { ui: ProductUi }) {
  return (
    <div className="ah" style={{ position: 'relative', width: ANNOTATE_RECORD.width, height: ANNOTATE_RECORD.height }}>
      <div className="ah ah-shot" style={{ width: ANNOTATE_RECORD.width, height: 132, borderRadius: 6, border: '1px solid var(--line)' }}>
        <Bar left={24} top={18} width={180} />
        <Bar left={24} top={36} width={300} />
        <figure className="ah-fig" style={{ left: 24, top: 52, width: 380 }}>
          <WideChart />
        </figure>
        <svg className="ah-annot-ink" viewBox="0 0 460 132" aria-hidden="true">
          <defs>
            <marker id="ah-annot-head-rec" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0 0L6 3L0 6z" fill="#e5484d" />
            </marker>
          </defs>
          <path d="M48 104 L 96 76" stroke="#e5484d" strokeWidth="2.5" fill="none" strokeLinecap="round" markerEnd="url(#ah-annot-head-rec)" />
          <ellipse cx="228" cy="72" rx="58" ry="28" fill="none" stroke="#0f9d8f" strokeWidth="2.5" />
        </svg>
        <span className="ah-step-b" style={{ 'left': 228, 'top': 100, '--fill': '#e5484d', '--ink': '#fff' } as CSSProperties}>
          1
        </span>
        {/* the cursor highlight follows the pointer; a ripple marks the left press (annotate.md §3.2) */}
        <span className="ah-cursor-ripple" style={{ left: 148, top: 34 }} aria-hidden="true" />
        <span className="ah-cursor-hl" style={{ left: 148, top: 34 }} aria-hidden="true" />
        <span className="ah-annot-cursor" style={{ left: 142, top: 28 }} aria-hidden="true">
          <Ic icon={MousePointer2} size={14} />
        </span>
      </div>
      <div className="ah-recpop" style={{ position: 'absolute', left: 0, top: 142, width: '100%' }} aria-hidden="true">
        <div className="ah-recpop-row">
          <i className="ah-recpop-rec" />
          <span>{ui.record.status.replace('{time}', '03:12')}</span>
          <span className="ah-recpop-stop">{ui.record.stop}</span>
        </div>
        <div className="ah-recpop-title">Retries can amplify an outage…</div>
      </div>
    </div>
  )
}
